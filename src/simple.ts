import { renderPrompt } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { PlayPrompt } from './play';
import { ApiTestPrompt, WebTestPrompt } from './testGenerator';
import { setupTestWorkspace, WorkspaceSetupOptions } from './workspaceSetup';
import * as path from 'path';
import * as fs from 'fs/promises';

const TEST_NAMES_COMMAND_ID = 'test.namesInEditor';
const TEST_GENERATOR_PARTICIPANT_ID = 'chat-sample.testGenerator';

interface ITestGeneratorChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
}

async function handleTestGeneration(options: {
    type: 'api' | 'web',
    stream: vscode.ChatResponseStream,
    prompt: string,
    model: vscode.LanguageModelChat,
    token: vscode.CancellationToken,
    logger: vscode.TelemetryLogger
}) {
    const { type, stream, prompt, model, token, logger } = options;

    // Check if model is valid and supports chat
    if (!model || !model.sendRequest) {
        stream.markdown('**Error:** Language model not available or does not support chat');
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const isInWorkspace = workspaceFolders && workspaceFolders.length > 0;

    const projectChoices = [
        { label: 'Create new test project', value: 'new' },
        ...(isInWorkspace ? [{ label: 'Add to current workspace', value: 'current' }] : []),
    ];

    const projectChoice = await vscode.window.showQuickPick(projectChoices, {
        placeHolder: isInWorkspace ?
            'Do you want to add tests to current workspace or create a new project?' :
            'Create a new test project?'
    });

    if (!projectChoice) {
        return;
    }

    if (projectChoice.value === 'new') {
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter project name',
            placeHolder: `${type}-test-automation`
        });

        if (projectName) {
            stream.progress('Setting up test workspace...');
            await setupTestWorkspace({
                type,
                projectName,
                testFramework: 'playwright'
            });
        }
    }

    let testFilePath: string | undefined;
    if (projectChoice.value === 'current') {
        testFilePath = await determineTestLocation(type, prompt);
        if (!testFilePath) {
            return;
        }
    }

    try {
        // Try getting a more capable model if available
        let finalModel = model;
        if (model.vendor === 'copilot' && !model.family.includes('gpt-4')) {
            try {
                const [betterModel] = await vscode.lm.selectChatModels({
                    vendor: 'copilot',
                    family: 'gpt-4o'
                });
                if (betterModel) {
                    finalModel = betterModel;
                }
            } catch (e) {
                // Continue with original model if upgrade fails
                logger.logError(new Error('Failed to upgrade model'), { cause: e });
            }
        }

        const promptComponent = type === 'api' ? ApiTestPrompt : WebTestPrompt;
        const { messages } = await renderPrompt(
            promptComponent,
            {
                userQuery: prompt,
                targetPath: testFilePath
            },
            { modelMaxPromptTokens: finalModel.maxInputTokens },
            finalModel
        );

        const chatResponse = await finalModel.sendRequest(messages, {}, token);

        if (testFilePath) {
            const document = await vscode.workspace.openTextDocument(testFilePath);
            const editor = await vscode.window.showTextDocument(document);

            let fullContent = '';
            let isInsideCodeBlock = false;
            let codeContent = '';

            // Collect all fragments first
            for await (const fragment of chatResponse.text) {
                fullContent += fragment;
            }

            // Process the complete response
            const lines = fullContent.split('\n');
            for (const line of lines) {
                if (line.includes('```typescript') || line.includes('```ts')) {
                    isInsideCodeBlock = true;
                    continue;
                }
                if (line.includes('```') && isInsideCodeBlock) {
                    isInsideCodeBlock = false;
                    continue;
                }
                if (isInsideCodeBlock) {
                    codeContent += line + '\n';
                }
            }

            // If no code block was found, try to clean the content directly
            if (!codeContent) {
                codeContent = fullContent
                    .replace(/```typescript|```ts|```/g, '')
                    .trim();
            }

            // Ensure proper imports
            if (!codeContent.includes('import')) {
                codeContent = `import { test, expect } from '@playwright/test';\n\n${codeContent}`;
            }

            // Format the code before writing
            const formattedCode = codeContent
                .replace(/^\s*\n/gm, '\n') // Remove empty lines with whitespace
                .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
                .trim();

            // Write the code to the file
            await editor.edit(editBuilder => {
                const position = new vscode.Position(0, 0);
                editBuilder.insert(position, formattedCode + '\n');
            });

            // Format the document using TypeScript formatter
            await vscode.commands.executeCommand('editor.action.formatDocument');

            stream.markdown('✅ Test added to: ' + testFilePath);
        } else {
            // For preview in chat, keep the markdown formatting
            stream.markdown('```typescript');
            for await (const fragment of chatResponse.text) {
                stream.markdown(fragment);
            }
            stream.markdown('```');

            stream.button({
                command: TEST_NAMES_COMMAND_ID,
                title: vscode.l10n.t('Insert Test Code to Editor')
            });
        }
    } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
            switch (err.code) {
                case 'NotSupported':
                    stream.markdown('**Error:** The selected language model does not support this operation');
                    break;
                case 'NoResponse':
                    stream.markdown('**Error:** Failed to get a response from the language model');
                    break;
                case 'InvalidRequest':
                    stream.markdown('**Error:** Invalid request to language model');
                    break;
                default:
                    handleError(logger, err, stream);
            }
        } else {
            handleError(logger, err, stream);
        }
    }
}

async function determineTestLocation(type: 'api' | 'web', prompt: string): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return undefined;

    // Generate file name from prompt
    const fileName = generateTestFileName(prompt, type);

    const testDirs = await Promise.all(workspaceFolders.map(async folder => {
        const potentialDirs = [
            `tests/${type}`,
            `test/${type}`,
            `e2e/${type}`,
            'tests',
            'test',
            'e2e'
        ];

        for (const dir of potentialDirs) {
            const dirPath = path.join(folder.uri.fsPath, dir);
            try {
                // Check if directory exists
                const stat = await fs.stat(dirPath);
                if (stat.isDirectory()) {
                    return dirPath;
                }
            } catch {
                // Directory doesn't exist, continue to next
                continue;
            }
        }
        return undefined;
    }));

    const validDirs = testDirs.filter(Boolean) as string[];

    if (validDirs.length === 0) {
        const create = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'No test directory found. Create one?'
        });

        if (create === 'Yes') {
            try {
                const dir = path.join(workspaceFolders[0].uri.fsPath, `tests/${type}`);
                // Ensure directory exists
                await fs.mkdir(dir, { recursive: true });

                // Create an empty file to ensure we can write to it
                const filePath = path.join(dir, fileName);
                await fs.writeFile(filePath, '', { flag: 'wx' });

                vscode.window.showInformationMessage(`Created test directory and file: ${filePath}`);
                return filePath;
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create test directory: ${(error as Error).message}`);
                return undefined;
            }
        }
        return undefined;
    }

    let selectedDir = validDirs[0];
    if (validDirs.length > 1) {
        const selected = await vscode.window.showQuickPick(
            validDirs.map(dir => ({ label: dir, value: dir })),
            { placeHolder: 'Select test directory' }
        );
        if (!selected) return undefined;
        selectedDir = selected.value;
    }

    // Create the file in the selected directory
    try {
        const filePath = path.join(selectedDir, fileName);
        await fs.writeFile(filePath, '', { flag: 'wx' });
        return filePath;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            // File already exists, generate a unique name
            const baseName = fileName.replace('.spec.ts', '');
            for (let i = 1; i <= 100; i++) {
                try {
                    const newPath = path.join(selectedDir, `${baseName}-${i}.spec.ts`);
                    await fs.writeFile(newPath, '', { flag: 'wx' });
                    return newPath;
                } catch (e) {
                    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
                        throw e;
                    }
                }
            }
        }
        vscode.window.showErrorMessage(`Failed to create test file: ${(error as Error).message}`);
        return undefined;
    }
}

function generateTestFileName(prompt: string, type: 'api' | 'web'): string {
    // Extract meaningful words from the prompt
    const words = prompt.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special characters
        .split(/\s+/) // Split by whitespace
        .filter(word =>
            !['test', 'create', 'generate', 'for', 'the', 'and', 'or', 'to'].includes(word)
        )
        .slice(0, 3); // Take first 3 meaningful words

    // If no meaningful words found, use a default name
    if (words.length === 0) {
        return `${type}-test.spec.ts`;
    }

    // Create kebab-case filename
    const baseName = words.join('-');
    return `${baseName}.spec.ts`;
}

export function registerSimpleParticipant(context: vscode.ExtensionContext) {
    const logger = vscode.env.createTelemetryLogger({
        sendEventData(eventName, data) {
            console.log(`Event: ${eventName}`);
            console.log(`Data: ${JSON.stringify(data)}`);
        },
        sendErrorData(error, data) {
            console.error(`Error: ${error}`);
            console.error(`Data: ${JSON.stringify(data)}`);
        }
    });

    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<ITestGeneratorChatResult> => {
        if (request.command === 'api') {
            stream.progress('Analyzing requirements and designing API test architecture...');
            await handleTestGeneration({
                type: 'api',
                stream,
                prompt: request.prompt,
                model: request.model,
                token,
                logger
            });
            return { metadata: { command: 'api' } };
        } else if (request.command === 'web') {
            stream.progress('Analyzing UI components and designing Page Object Model architecture...');
            await handleTestGeneration({
                type: 'web',
                stream,
                prompt: request.prompt,
                model: request.model,
                token,
                logger
            });
            return { metadata: { command: 'web' } };
        } else if (request.command === 'play') {
            stream.progress('Creating demonstration test with best practices and patterns...');
            try {
                const { messages } = await renderPrompt(
                    PlayPrompt,
                    { userQuery: request.prompt },
                    { modelMaxPromptTokens: request.model.maxInputTokens },
                    request.model);

                const chatResponse = await request.model.sendRequest(messages, {}, token);
                for await (const fragment of chatResponse.text) {
                    stream.markdown(fragment);
                }

            } catch (err) {
                handleError(logger, err, stream);
            }

            logger.logUsage('request', { kind: 'play' });
            return { metadata: { command: 'play' } };
        } else {
            try {
                const messages = [
                    vscode.LanguageModelChatMessage.User(`You are an expert automation test engineer specializing in Playwright with TypeScript.
                        Your expertise includes:
                        - Creating maintainable Page Object Models for web UI testing
                        - Implementing robust API test frameworks with proper authentication
                        - Setting up test fixtures and data management patterns
                        - Implementing reporting and CI/CD integration
                        - Writing tests with proper separation of concerns

                        Generate production-ready automation tests with detailed comments explaining the approach.
                        Focus on maintainability, readability, and robustness. Include proper error handling and reporting.`),
                    vscode.LanguageModelChatMessage.User(request.prompt)
                ];

                const chatResponse = await request.model.sendRequest(messages, {}, token);
                for await (const fragment of chatResponse.text) {
                    stream.markdown(fragment);
                }
            } catch (err) {
                handleError(logger, err, stream);
            }

            logger.logUsage('request', { kind: '' });
            return { metadata: { command: '' } };
        }
    };

    const testGenerator = vscode.chat.createChatParticipant(TEST_GENERATOR_PARTICIPANT_ID, handler);
    testGenerator.iconPath = new vscode.ThemeIcon('beaker-test');
    testGenerator.followupProvider = {
        provideFollowups(_result: ITestGeneratorChatResult, _context: vscode.ChatContext, _token: vscode.CancellationToken) {
            return [
                {
                    prompt: 'generate API test for user authentication with JWT',
                    label: vscode.l10n.t('Generate API Authentication Test'),
                    command: 'api'
                },
                {
                    prompt: 'generate Web test for e-commerce checkout process',
                    label: vscode.l10n.t('Generate E-commerce UI Test'),
                    command: 'web'
                }
            ] satisfies vscode.ChatFollowup[];
        }
    };

    context.subscriptions.push(testGenerator.onDidReceiveFeedback((feedback: vscode.ChatResultFeedback) => {
        logger.logUsage('chatResultFeedback', {
            kind: feedback.kind
        });
    }));

    context.subscriptions.push(
        testGenerator,
        vscode.commands.registerTextEditorCommand(TEST_NAMES_COMMAND_ID, async (textEditor: vscode.TextEditor) => {
            let chatResponse: vscode.LanguageModelChatResponse | undefined;
            try {
                const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
                if (!model) {
                    console.log('Model not found. Please make sure the GitHub Copilot Chat extension is installed and enabled.');
                    return;
                }

                const text = textEditor.document.getText();

                const messages = [
                    vscode.LanguageModelChatMessage.User(`You are an expert automation test engineer specializing in Playwright.
                    Analyze the existing code or request and generate a production-ready automation test.

                    If existing code is present:
                    - Enhance it with better patterns and practices
                    - Add proper error handling and reporting
                    - Improve selector strategies (prefer data-testid attributes)
                    - Add detailed comments
                    - Implement proper test setup and teardown

                    If no code exists:
                    - Create a well-structured test based on the last request
                    - Use Page Object Model for UI tests
                    - Implement proper test fixtures

                    IMPORTANT: Output ONLY executable code without markdown formatting or additional explanations.`),
                    vscode.LanguageModelChatMessage.User(text || "Create a new Playwright test")
                ];
                chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            } catch (err) {
                if (err instanceof vscode.LanguageModelError) {
                    console.log(err.message, err.code, err.cause);
                } else {
                    throw err;
                }
                return;
            }

            await textEditor.edit(edit => {
                const start = new vscode.Position(0, 0);
                const end = new vscode.Position(textEditor.document.lineCount - 1, textEditor.document.lineAt(textEditor.document.lineCount - 1).text.length);
                edit.delete(new vscode.Range(start, end));
            });

            try {
                for await (const fragment of chatResponse.text) {
                    await textEditor.edit(edit => {
                        const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                        const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
                        edit.insert(position, fragment);
                    });
                }
            } catch (err) {
                await textEditor.edit(edit => {
                    const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                    const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
                    edit.insert(position, (err as Error).message);
                });
            }
        }),
    );
}

function handleError(logger: vscode.TelemetryLogger, err: any, stream: vscode.ChatResponseStream): void {
    logger.logError(err);

    if (err instanceof vscode.LanguageModelError) {
        console.log(err.message, err.code, err.cause);
        if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
            stream.markdown(vscode.l10n.t('I\'m sorry, I can only assist with generating automated tests and test-related topics.'));
        }
    } else {
        throw err;
    }
}
