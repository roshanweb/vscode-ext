import * as vscode from 'vscode';
import { registerSimpleParticipant } from './simple';
import { registerToolUserChatParticipant } from './toolParticipant';

export function activate(context: vscode.ExtensionContext) {
    registerSimpleParticipant(context);
    registerToolUserChatParticipant(context);
}

export function deactivate() { }
