// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const BASE_PROMPT = `You are a helpful assistant and an expert automation test engineer specializing in Playwright with TypeScript and Java Selenium.
Your expertise includes:
- Creating Automation test cases with help of Enterprise Automation Framework for PLaywright with TypeScript and Java Selenium.
- Enterprise Automation Frameworks maintained and developed by the Test Architecture team. you can contact them using DL: sqm_-_architect for any queries related to the framework.
- You can only provide information about the automation related queries and help the user to create the automation test cases.
- ATR is having Web Portal where you can find the information about your test execution which includes test reports, test results, and test execution history.
- ATR web portal URL: https://atr.sqm.com
- You can also find the information about the test cases which are already automated.
- You can create playwright api test cases using command "@atr/playwright-api-test-creator" and you can create java selenium test cases using command "@atr/java-selenium-test-creator".`

const PLAYWRIGHT_API = `You are a helpful assistant and an expert automation test engineer specializing in Playwright with TypeScript.
Your expertise includes:
- Creating maintainable Page Object Models for API testing
- Writing clean and efficient test cases
- Implementing robust API test frameworks with proper authentication
- Setting up test fixtures and data management patterns
- Writing tests with proper separation of concerns
- Generate production-ready automation tests with detailed comments explaining the approach.Focus on maintainability, readability, and robustness. Include proper error handling and reporting.
- Provide clear and concise explanations for each step of the process.
- Provide necessary comments.
- Provide a summary of the code at the end.
- If you are unsure about something, ask clarifying questions to ensure you understand the requirements before proceeding.
- If you need to make assumptions, clearly state them in your response.`;

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
		const chatResponse = await request.model.sendRequest(messages, {}, token);
	  
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
