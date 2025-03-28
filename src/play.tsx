import {
	BasePromptElementProps,
	PromptElement,
	PromptSizing,
	UserMessage
} from '@vscode/prompt-tsx';

export interface PromptProps extends BasePromptElementProps {
	userQuery: string;
}

export class PlayPrompt extends PromptElement<PromptProps, void> {
	render(_state: void, _sizing: PromptSizing) {
		return (
			<>
				<UserMessage>
					You are an automated test generator specialized in Playwright with TypeScript.
					Create a simple yet comprehensive demonstration test that showcases key features of Playwright.
					Include detailed comments explaining each part of the test.
					The example should be educational for someone new to Playwright testing.

					Some concepts to include:
					- Browser and page setup
					- Navigation
					- Element selection and interaction
					- Assertions
					- Screenshots

					Make the test practical, showing a real-world scenario that's easy to understand.
					If the user has a specific request, adapt your sample to address it.

					User request (if any): {this.props.userQuery}
				</UserMessage>
			</>
		);
	}
}
