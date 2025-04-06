// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { readPromptFile } from './utils';

// Load prompts from files
const BASE_PROMPT = readPromptFile('base-prompt.md');
const PLAYWRIGHT_API = readPromptFile('playwright-api.md');


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "sqm-atr" is now active!');

	// define a chat handler
	const handler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	) => {

		  // Use gpt-4o since it is fast and high quality.
		  const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
		  if (!model) {
			  console.log('Model not found. Please make sure the GitHub Copilot Chat extension is installed and enabled.');
			  return;
		  }

		// initialize the prompt
		let prompt = BASE_PROMPT;

		if (request.command === 'playwright-api-test-creator') {
			prompt = PLAYWRIGHT_API;
		  }

		// initialize the messages array with the prompt
		const messages = [vscode.LanguageModelChatMessage.User(prompt)];

		// get all the previous participant messages
		const previousMessages = context.history.filter(
		  h => h instanceof vscode.ChatResponseTurn
		);
	  
		// add the previous messages to the messages array
		previousMessages.forEach(m => {
		  let fullMessage = '';
		  m.response.forEach(r => {
			const mdPart = r as vscode.ChatResponseMarkdownPart;
			fullMessage += mdPart.value.value;
		  });
		  messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
		});
	  
		// add in the user's message
		messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
	  
		// send the request
		const chatResponse = await model.sendRequest(messages, {}, token);
	  
		// stream the response
		for await (const fragment of chatResponse.text) {
		  stream.markdown(fragment);
		}
	  
		return;
	};

	// create participant
	const tutor = vscode.chat.createChatParticipant('sqm.atr-app', handler);

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with registerCommand
	// // The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('atr', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from sqm-atr!');
	});

	context.subscriptions.push(disposable);



}

// This method is called when your extension is deactivated
export function deactivate() { }
