import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec);

export interface WorkspaceSetupOptions {
    type: 'api' | 'web';
    projectName: string;
    testFramework: 'playwright';
}

const REPO_CONFIG = {
    web: {
        url: 'https://github.com/akshayp7/playwright-typescript-playwright-test.git',
        branch: 'main'
    },
    api: {
        url: 'https://github.com/akshayp7/playwright-typescript-playwright-test.git',
        branch: 'main'
    }
};

export async function setupTestWorkspace(options: WorkspaceSetupOptions): Promise<void> {
    try {
        // Verify git is installed
        await exec('git --version');
    } catch (error) {
        vscode.window.showErrorMessage('Git is not installed. Please install Git to continue.');
        return;
    }

    // Ask user for workspace location
    const workspaceLocation = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Select location for test project'
    });

    if (!workspaceLocation || workspaceLocation.length === 0) {
        return;
    }

    const projectPath = path.join(workspaceLocation[0].fsPath, options.projectName);

    try {
        // Show progress while cloning
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Setting up ${options.type.toUpperCase()} test project...`,
            cancellable: false
        }, async (progress) => {
            // Clone the repository
            progress.report({ message: 'Cloning repository...' });
            const repoConfig = REPO_CONFIG[options.type];
            await cloneRepository(repoConfig.url, projectPath, repoConfig.branch);

            // Customize the cloned project
            progress.report({ message: 'Customizing project...' });
            await customizeProject(projectPath, options);

            // Initialize git
            progress.report({ message: 'Initializing git...' });
            await initializeGit(projectPath);

            // Install dependencies
            progress.report({ message: 'Installing dependencies...' });
            await installDependencies(projectPath);
        });

        // Open the workspace
        const workspaceFile = vscode.Uri.file(projectPath);
        await vscode.commands.executeCommand('vscode.openFolder', workspaceFile);

        vscode.window.showInformationMessage(`${options.type.toUpperCase()} test project setup complete!`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to set up project: ${(error as Error).message}`);
        // Clean up if project creation failed
        try {
            await fs.rm(projectPath, { recursive: true, force: true });
        } catch (e) {
            console.error('Failed to clean up project directory:', e);
        }
    }
}

async function cloneRepository(repoUrl: string, targetPath: string, branch: string): Promise<void> {
    await exec(`git clone -b ${branch} ${repoUrl} "${targetPath}"`);
}

async function customizeProject(projectPath: string, options: WorkspaceSetupOptions): Promise<void> {
    // Update package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    packageJson.name = options.projectName;
    packageJson.description = `${options.type.toUpperCase()} Test Automation Project with Playwright`;

    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Update environment files if they exist
    try {
        const envExamplePath = path.join(projectPath, '.env.example');
        const envPath = path.join(projectPath, '.env');

        if (await fs.stat(envExamplePath)) {
            await fs.copyFile(envExamplePath, envPath);
        }
    } catch (error) {
        // Ignore if .env.example doesn't exist
    }

    // Create VSCode workspace settings
    const vscodePath = path.join(projectPath, '.vscode');
    await fs.mkdir(vscodePath, { recursive: true });

    const settingsContent = {
        'typescript.tsdk': 'node_modules/typescript/lib',
        'editor.formatOnSave': true,
        'editor.codeActionsOnSave': {
            'source.fixAll': true
        },
        'playwright.env': {
            'baseURL': 'http://localhost:3000',
            'apiURL': 'http://localhost:3000/api'
        }
    };

    await fs.writeFile(
        path.join(vscodePath, 'settings.json'),
        JSON.stringify(settingsContent, null, 2)
    );
}

async function initializeGit(projectPath: string): Promise<void> {
    // Remove existing git directory
    const gitPath = path.join(projectPath, '.git');
    await fs.rm(gitPath, { recursive: true, force: true });

    // Initialize new git repository
    await exec('git init', { cwd: projectPath });
    await exec('git add .', { cwd: projectPath });
    await exec('git commit -m "Initial commit: Project setup from template"', { cwd: projectPath });
}

async function installDependencies(projectPath: string): Promise<void> {
    await exec('npm install', { cwd: projectPath });
}
