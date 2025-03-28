import {
    BasePromptElementProps,
    PromptElement,
    PromptSizing,
    UserMessage
} from '@vscode/prompt-tsx';

export interface PromptProps extends BasePromptElementProps {
    userQuery: string;
    targetPath?: string;
}

export class ApiTestPrompt extends PromptElement<PromptProps, void> {
    render(_state: void, _sizing: PromptSizing) {
        const targetContext = this.props.targetPath ?
            `\nTarget file: ${this.props.targetPath}\nEnsure the test integrates well with existing tests in the file.` : '';

        const codeTemplate = `
// Required imports
import { test, expect } from '@playwright/test';
// Any additional imports

// Test fixtures and setup (if needed)

test.describe('Feature: [derived from user query]', () => {
    // Your test implementation here
});`;

        return (
            <>
                <UserMessage>
                    Generate a complete Playwright API test case for the following requirement:
                    {this.props.userQuery}
                    {targetContext}

                    Write ONLY the test code following these rules:
                    1. Use TypeScript and Playwright's test framework
                    2. Include all necessary imports
                    3. Include proper setup and teardown
                    4. Add comprehensive assertions
                    5. Include error handling
                    6. Add detailed comments explaining the test flow

                    Structure the test following this pattern:
                    {`\`\`\`typescript\n${codeTemplate}\n\`\`\``}

                    IMPORTANT: Output ONLY the executable test code, no explanations outside the code comments.
                </UserMessage>
            </>
        );
    }
}

export class WebTestPrompt extends PromptElement<PromptProps, void> {
    render(_state: void, _sizing: PromptSizing) {
        const targetContext = this.props.targetPath ?
            `\nTarget file: ${this.props.targetPath}\nEnsure the test integrates well with existing tests in the file.` : '';

        const codeTemplate = `
// Required imports
import { test, expect } from '@playwright/test';
// Any additional imports

// Page Object class (if needed)
class PageName {
    // Page object implementation
}

// Test fixtures and setup (if needed)

test.describe('Feature: [derived from user query]', () => {
    // Your test implementation here
});`;

        return (
            <>
                <UserMessage>
                    Generate a complete Playwright Web UI test case for the following requirement:
                    {this.props.userQuery}
                    {targetContext}

                    Write ONLY the test code following these rules:
                    1. Use TypeScript and Playwright's test framework
                    2. Use Page Object Model pattern
                    3. Include all necessary imports
                    4. Include proper setup and teardown
                    5. Use data-testid for selectors when possible
                    6. Add comprehensive assertions
                    7. Include error handling
                    8. Add detailed comments explaining the test flow

                    Structure the test following this pattern:
                    {`\`\`\`typescript\n${codeTemplate}\n\`\`\``}

                    IMPORTANT: Output ONLY the executable test code, no explanations outside the code comments.
                </UserMessage>
            </>
        );
    }
}
