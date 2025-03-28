import { renderPrompt } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { PlayPrompt } from './play';
import { ApiTestPrompt, WebTestPrompt } from './testGenerator';

const TEST_NAMES_COMMAND_ID = 'test.namesInEditor';
const TEST_GENERATOR_PARTICIPANT_ID = 'chat-sample.testGenerator';

interface ITestGeneratorChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
}

export function registerSimpleParticipant(context: vscode.ExtensionContext) {

    // Define a Test Generator chat handler.
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<ITestGeneratorChatResult> => {
        // To talk to an LLM in your subcommand handler implementation, your
        // extension can use VS Code's `requestChatAccess` API to access the Copilot API.
        // The GitHub Copilot Chat extension implements this provider.
        if (request.command === 'api') {
            stream.progress('Analyzing requirements for API test generation...');
            try {
                // Here's an example of how to use the prompt-tsx library to build a prompt
                const { messages } = await renderPrompt(
                    ApiTestPrompt,
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

            stream.button({
                command: TEST_NAMES_COMMAND_ID,
                title: vscode.l10n.t('Insert Test Code to Editor')
            });

            logger.logUsage('request', { kind: 'api' });
            return { metadata: { command: 'api' } };
        } else if (request.command === 'web') {
            stream.progress('Analyzing requirements for Web UI test generation...');
            try {
                // Here's an example of how to use the prompt-tsx library to build a prompt
                const { messages } = await renderPrompt(
                    WebTestPrompt,
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

            stream.button({
                command: TEST_NAMES_COMMAND_ID,
                title: vscode.l10n.t('Insert Test Code to Editor')
            });

            logger.logUsage('request', { kind: 'web' });
            return { metadata: { command: 'web' } };
        } else if (request.command === 'play') {
            stream.progress('Preparing to generate a sample test...');
            try {
                // Here's an example of how to use the prompt-tsx library to build a prompt
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
                    vscode.LanguageModelChatMessage.User(`You are an automated test generator specialized in creating Playwright tests with TypeScript.
                        Your job is to create well-structured, maintainable test scripts based on user requirements. You should follow best practices for Playwright testing.
                        Always include detailed comments and explanations in your code.`),
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

    // Chat participants appear as top-level options in the chat input
    // when you type `@`, and can contribute sub-commands in the chat input
    // that appear when you type `/`.
    const testGenerator = vscode.chat.createChatParticipant(TEST_GENERATOR_PARTICIPANT_ID, handler);
    testGenerator.iconPath = new vscode.ThemeIcon('test');
    testGenerator.followupProvider = {
        provideFollowups(_result: ITestGeneratorChatResult, _context: vscode.ChatContext, _token: vscode.CancellationToken) {
            return [
                {
                    prompt: 'generate API test for user login',
                    label: vscode.l10n.t('Generate API test sample'),
                    command: 'api'
                },
                {
                    prompt: 'generate Web test for login form',
                    label: vscode.l10n.t('Generate Web test sample'),
                    command: 'web'
                }
            ] satisfies vscode.ChatFollowup[];
        }
    };

    const logger = vscode.env.createTelemetryLogger({
        sendEventData(eventName, data) {
            // Capture event telemetry
            console.log(`Event: ${eventName}`);
            console.log(`Data: ${JSON.stringify(data)}`);
        },
        sendErrorData(error, data) {
            // Capture error telemetry
            console.error(`Error: ${error}`);
            console.error(`Data: ${JSON.stringify(data)}`);
        }
    });

    context.subscriptions.push(testGenerator.onDidReceiveFeedback((feedback: vscode.ChatResultFeedback) => {
        // Log chat result feedback to be able to compute the success matric of the participant
        // unhelpful / totalRequests is a good success metric
        logger.logUsage('chatResultFeedback', {
            kind: feedback.kind
        });
    }));

    context.subscriptions.push(
        testGenerator,
        // Register the command handler for inserting test code to editor
        vscode.commands.registerTextEditorCommand(TEST_NAMES_COMMAND_ID, async (textEditor: vscode.TextEditor) => {
            // Get the test code from the last chat response and insert it into the editor
            let chatResponse: vscode.LanguageModelChatResponse | undefined;
            try {
                // Use gpt-4o since it is fast and high quality.
                const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
                if (!model) {
                    console.log('Model not found. Please make sure the GitHub Copilot Chat extension is installed and enabled.');
                    return;
                }

                // Get the content of the active editor
                const text = textEditor.document.getText();

                const messages = [
                    vscode.LanguageModelChatMessage.User(`You are an automated test generator.
                    Create a fully functional Playwright test based on the chat history or improve the existing code in the editor.
                    If there's existing code, analyze it and enhance it with better patterns, assertions, and comments.
                    If there's no code yet, create a new test based on the last request.
                    IMPORTANT: Respond with ONLY code. No markdown or explanations outside the code.`),
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

            // Clear the editor content before inserting new content
            await textEditor.edit(edit => {
                const start = new vscode.Position(0, 0);
                const end = new vscode.Position(textEditor.document.lineCount - 1, textEditor.document.lineAt(textEditor.document.lineCount - 1).text.length);
                edit.delete(new vscode.Range(start, end));
            });

            // Stream the code into the editor as it is coming in from the Language Model
            try {
                for await (const fragment of chatResponse.text) {
                    await textEditor.edit(edit => {
                        const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                        const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
                        edit.insert(position, fragment);
                    });
                }
            } catch (err) {
                // async response stream may fail, e.g network interruption or server side error
                await textEditor.edit(edit => {
                    const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1);
                    const position = new vscode.Position(lastLine.lineNumber, lastLine.text.length);
                    edit.insert(position, (err as Error).message);
                });
            }
        }),
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleError(logger: vscode.TelemetryLogger, err: any, stream: vscode.ChatResponseStream): void {
    // making the chat request might fail because
    // - model does not exist
    // - user consent not given
    // - quote limits exceeded
    logger.logError(err);

    if (err instanceof vscode.LanguageModelError) {
        console.log(err.message, err.code, err.cause);
        if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
            stream.markdown(vscode.l10n.t('I\'m sorry, I can only help with generating automated tests.'));
        }
    } else {
        // re-throw other errors so they show up in the UI
        throw err;
    }
}
