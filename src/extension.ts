'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {ModuleModifier} from './modulemodifier';

const InvalidCharacterRegex = /[^\w\d_]|^\d/i

enum FileType {
    Component,
    Directive,
}

function getLessTemplate(name: string[]) {
    return `
// TODO write style code
`
}

function getHTMLTemplate(name: string[]) {
    return `<link rel="stylesheet" type="text/css" href="${getFileName(name, '.component.css')}">

<!-- TODO write template code -->
`;
}

function getComponentTemplate(prefix: string[], name: string[]) {
    return `import {Component, ChangeDetectionStrategy} from '@angular/core';

@Component({
    moduleId: module.id,
    selector: '${getSelectorName(prefix, name)}',
    templateUrl: './${getFileName(name, '.component.html')}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${getClassName(name)} {
    // TODO implement component
}
`;
}

function getModuleTemplate(prefix: string[], name: string[]) {
    return `import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

@NgModule({
    declarations: [
    ],
    entryComponents: [
    ],
    exports: [
    ],
    imports: [
        CommonModule,
    ],
})
export class ${getModuleClassName(prefix, name)} {};
`;
}

function getDirectiveTemplate(prefix: string[], name: string[]) {
    return `import {Directive} from '@angular/core';

@Directive({
    moduleId: module.id,
    selector: '${getDirectiveSelectorName(prefix, name)}',
})
export class ${getDirectiveClassName(name)} {
    // TODO implement directive
}
`;
}

function camelCase(nameParts: string[], capitalizeFirst: boolean) {
    return nameParts.map((part, index) => ((capitalizeFirst || index !== 0) ? part[0].toUpperCase() : part[0].toLowerCase()) + part.substr(1)).join('');
}

function getNameParts(name: string): string[] {
    return name.trim().replace(/([a-z](?=[A-Z]))/g, '$1\n').split('\n').map(part => part.toLowerCase()).filter(a => a.length > 0);
}

function getFolderName(nameParts: string[]): string {
    return nameParts.join('');
}

function getFileName(nameParts: string[], ext: string): string {
    return getFolderName(nameParts) + ext;
}

function getModuleName(nameParts: string[]): string {
    return getFolderName(nameParts) + '.module.ts';
}

function getModuleClassName(prefix: string[], nameParts: string[]): string {
    return camelCase(prefix.concat(nameParts), true) + 'Module';
}


function getSelectorName(prefix: string[], nameParts: string[]): string {
    if (prefix.length) {
        return `${prefix.join('-')}-${nameParts.join('-')}`;
    } else {
        return nameParts.join('-');
    }
}

function getClassName(nameParts: string[]): string {
    return camelCase(nameParts, true) + 'Component';
}

function getDirectiveSelectorName(prefix: string[], nameParts: string[]): string {
    return camelCase(prefix.concat(nameParts), false);
}

function getDirectiveClassName(nameParts: string[]): string {
    return camelCase(nameParts, true) + 'Directive';
}

function writeFile(path: string, content: string): Promise<any> {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, content, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function createModule(prefix: string[], name: string[], inFolder: string):Promise<any> {
    const containingFolder = path.join(inFolder, getFolderName(name));

    if (fs.existsSync(containingFolder)) {
        return Promise.reject(new Error("File or folder with name " + containingFolder + " already exists"));
    } else {
        const modulePath = path.join(containingFolder, getModuleName(name));
        return new Promise((resolve, reject) => {
            fs.mkdir(containingFolder, (err) => {
                if (err) {
                    reject(err);
                } else {
                    writeFile(modulePath, getModuleTemplate(prefix, name)).then(resolve, reject);
                }
            })
        }).then(() => {
            return vscode.workspace.openTextDocument(modulePath).then((textDoc) => {
                return vscode.window.showTextDocument(textDoc);
            });
        });
    }
}

function createComponent(prefix: string[], name: string[], inFolder: string):Promise<any> {
    const containingFolder = path.join(inFolder, getFolderName(name));

    if (fs.existsSync(containingFolder)) {
        return Promise.reject(new Error("File or folder with name " + containingFolder + " already exists"));
    } else {
        const componentPath = path.join(containingFolder, getFileName(name, '.component.ts'));
        return new Promise((resolve, reject) => {
            fs.mkdir(containingFolder, (err) => {
                if (err) {
                    reject(err);
                } else {
                    Promise.all([
                        writeFile(componentPath, getComponentTemplate(prefix, name)),
                        writeFile(path.join(containingFolder, getFileName(name, '.component.html')), getHTMLTemplate(name)),
                        writeFile(path.join(containingFolder, getFileName(name, '.component.less')), getLessTemplate(name)),
                    ]).then(resolve, reject);
                }
            });
        }).then(() => {
            return vscode.workspace.openTextDocument(componentPath).then((textDoc) => {
                return vscode.window.showTextDocument(textDoc);
            });
        });
    }
}

function createDirective(prefix: string[], name: string[], inFolder: string): Promise<any> {
    const directivePath = path.join(inFolder, getFileName(name, '.directive.ts'));

    if (fs.existsSync(directivePath)) {
        return Promise.reject(new Error(`File with name ${directivePath} already exists`));
    } else {
        return writeFile(directivePath, getDirectiveTemplate(prefix, name)).then(() => {
            return vscode.workspace.openTextDocument(directivePath).then(textDoc => {
                return vscode.window.showTextDocument(textDoc);
            });
        });
    }
}

function findModules(inDirectory: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        fs.readdir(inDirectory, (err, items) => {
            if (err) {
                reject(err);
            } else {
                const result = items.filter(item =>
                    item.indexOf('.module.ts') !== -1
                ).map(item => path.join(inDirectory, item));

                const next = path.join(inDirectory, '..');

                const doNext = (vscode.workspace.workspaceFolders || []).some((folder) => {
                    return path.relative(folder.uri.fsPath, next).substr(0, 2) !== '..';
                });

                if (doNext) {
                    findModules(next).then((moreModules) => {
                        resolve(result.concat(moreModules));
                    }, reject);
                } else {
                    resolve(result);
                }
            }
        });
    });
}

export async function addToModule(moduleUri: string, name: string[], inFolder: string, fileType: FileType): Promise<any> {
    const module = new ModuleModifier(moduleUri);
    const containingFolder = path.join(inFolder, getFolderName(name));
    const extension = fileType === FileType.Component ? '.component' : '.directive';
    const className = fileType === FileType.Component ? getClassName(name) : getDirectiveClassName(name);

    const result = await module.addImport([className], path.join(containingFolder, getFileName(name, extension)), extension);

    if (!result) {
        vscode.window.showWarningMessage("Could not add import to module");
    }

    const declarationAdd = await module.addToModule('declarations', className);

    if (!declarationAdd) {
        vscode.window.showWarningMessage("Could not add class to declarations");
    }

    const exportsAdd = await module.addToModule('exports', className);

    if (!exportsAdd) {
        vscode.window.showWarningMessage("Could not add class to exports");
    }
}

export function checkAddToModule(modules: string[], name: string[], inFolder: string, fileType: FileType): Promise<any> {
    const relativeModules = modules.map(mod => path.relative(inFolder, mod));
    relativeModules.push('Do not add to a module');
    return Promise.resolve(vscode.window.showQuickPick(relativeModules, {
        placeHolder: 'Add to module',
    }).then(selectResult => {
        const moduleIndex = relativeModules.indexOf(selectResult);

        if (moduleIndex >= 0 && moduleIndex < modules.length) {
            return addToModule(modules[moduleIndex], name, inFolder, fileType);
        }
    }));
}

export function getNameOfObject(defaultName: string, prompt: string, exampleName: string): Promise<string> {
    return Promise.resolve(vscode.window.showInputBox({
        prompt: prompt,
        value: defaultName,
        validateInput: (currentName) => {
            if (!currentName) {
                return 'Name is required';
            } else if (InvalidCharacterRegex.test(currentName)) {
                return 'Name should be valid javascript token with letter numbers and underscores and no spaces';
            } else if (currentName[0].toUpperCase() != currentName[0]) {
                return 'Name should be upper camel case eg ' + exampleName;
            } else {
                return null;
            }
        },
    }).then((result) => {
        if (!result) {
            throw new Error('Name should be a valid upper camel case javascript token');
        } else {
            return result;
        }
    }));
}

export function getPrefix(): string[] {
    const result = vscode.workspace.getConfiguration('ngTemplates').prefix;

    if (typeof result === 'string') {
        return getNameParts(result);
    } else {
        return [];
    }
}

export function activate(context: vscode.ExtensionContext) {
    const createComponentListener = vscode.commands.registerCommand('ngTemplates.create-component', (uri:vscode.Uri) => {
        if (!uri.fsPath) {
            vscode.window.showErrorMessage('No folder selected to contain new component');
            return;
        }

        getNameOfObject('NewComponent', 'Name of component class', 'TestComponent FooBarComponent').then((componentName) => {
            const name = getNameParts(componentName);

            if (name[name.length - 1] === 'component') {
                name.pop();
            }

            const prefix = getPrefix();

            return createComponent(prefix, name, uri.fsPath).then(() => {
                return findModules(uri.fsPath).then((modules) => {
                    if (modules.length) {
                        return checkAddToModule(modules, name, uri.fsPath, FileType.Component);
                    }
                });
            });
        }).catch((err) => {
            vscode.window.showErrorMessage(err.toString());
            console.error(err);
        });
    });
    context.subscriptions.push(createComponentListener);

    const createDirectiveListener = vscode.commands.registerCommand('ngTemplates.create-directive', (uri:vscode.Uri) => {
        if (!uri.fsPath) {
            vscode.window.showErrorMessage('No folder selected to contain new directive');
            return;
        }

        const prefix = getPrefix();

        getNameOfObject('NewDirective', 'Name of directive class', 'TestDirective, FooBarDirective').then((directiveName) => {
            const name = getNameParts(directiveName);

            if (name[name.length - 1] === 'directive') {
                name.pop();
            }

            return createDirective(prefix, name, uri.fsPath).then(() => {
                return findModules(uri.fsPath).then((modules) => {
                    if (modules.length) {
                        return checkAddToModule(modules, name, uri.fsPath, FileType.Directive);
                    }
                });
            });
        }).catch((err) => {
            vscode.window.showErrorMessage(err.toString());
            console.error(err);
        });;
    });
    context.subscriptions.push(createDirectiveListener);

    const createModuleListener = vscode.commands.registerCommand('ngTemplates.create-module', (uri: vscode.Uri) => {
        if (!uri.fsPath) {
            vscode.window.showErrorMessage('No folder selected to contain new module');
            return;
        }

        const prefix = getPrefix();

        getNameOfObject('NewModule', 'Name of module class', 'TestModule FooBarModule').then((moduleName) => {
            const name = getNameParts(moduleName);

            if (name[name.length - 1] === 'module') {
                name.pop();
            }

            if (prefix.every((part, index) => name[index] === part)) {
                name.splice(0, prefix.length);
            }

            return createModule(prefix, name, uri.fsPath);
        }).catch((err) => {
            vscode.window.showErrorMessage(err.toString());
            console.error(err);
        });
    });
    context.subscriptions.push(createModuleListener);
}

export function deactivate() {
}