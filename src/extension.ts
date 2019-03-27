'use strict';
import * as vscode from 'vscode';
import * as angular from './angular';
import * as unittests from './unittests';

export function activate(context: vscode.ExtensionContext) {
    angular.activate(context);
    unittests.activate(context);
}

export function deactivate() {
    angular.deactivate();
    unittests.deactivate();
}