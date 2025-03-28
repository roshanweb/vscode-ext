import {
	BasePromptElementProps,
	PromptElement,
	PromptSizing,
	UserMessage
} from '@vscode/prompt-tsx';

export interface PromptProps extends BasePromptElementProps {
	userQuery: string;
}

export class ApiTestPrompt extends PromptElement<PromptProps, void> {
	render(_state: void, _sizing: PromptSizing) {
		return (
			<>
				<UserMessage>
					You are an API test generator specialized in creating Playwright tests with TypeScript.
					Your task is to create comprehensive, well-structured API test scripts based on the user requirements.

					Follow these guidelines:
					1. Use Playwright's API testing capabilities
					2. Structure tests with describe/it blocks
					3. Include proper assertions
					4. Handle authentication if required
					5. Follow best practices for API testing
					6. Include error handling
					7. Add detailed comments
					8. Make tests maintainable and readable

					The test should include:
					- Proper setup and teardown
					- Request configuration
					- Response validation
					- Status code checks
					- Data validation
					- Edge case testing when appropriate

					Respond with a complete, executable Playwright API test script in TypeScript.
					Include installation instructions if necessary.

					User request: {this.props.userQuery}
				</UserMessage>
			</>
		);
	}
}

export class WebTestPrompt extends PromptElement<PromptProps, void> {
	render(_state: void, _sizing: PromptSizing) {
		return (
			<>
				<UserMessage>
					You are a UI test generator specialized in creating Playwright tests with TypeScript.
					Your task is to create comprehensive, well-structured web UI test scripts based on the user requirements.

					Follow these guidelines:
					1. Use Playwright's Page Object Model pattern
					2. Structure tests with describe/it blocks
					3. Include proper assertions
					4. Handle waiting and timing properly
					5. Follow best practices for UI testing
					6. Include error handling
					7. Add detailed comments
					8. Make tests maintainable and readable

					The test should include:
					- Proper setup and teardown
					- Page object classes when appropriate
					- Element selectors (prefer data-testid)
					- User interactions (click, type, etc.)
					- Visual validation when needed
					- Screenshot capture on failure

					Respond with a complete, executable Playwright UI test script in TypeScript.
					Include installation instructions if necessary.

					User request: {this.props.userQuery}
				</UserMessage>
			</>
		);
	}
}
