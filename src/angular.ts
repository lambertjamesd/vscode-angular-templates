'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {writeFile, findModules, findBuild} from './file';
import {ModuleModifier} from './modulemodifier';
import {getNameParts, getComponentNameParts, getSelectorName, getPrefix, camelCase, getModuleClassName} from './naming';

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

function getFolderName(nameParts: string[]): string {
    return nameParts.join('');
}

function getFileName(nameParts: string[], ext: string): string {
    return getFolderName(nameParts) + ext;
}

function getModuleName(nameParts: string[]): string {
    return getFolderName(nameParts) + '.module.ts';
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

export async function goToBuild(inDirectory: string) {
    findBuild(inDirectory).then(buildPath => {
        if(buildPath) {
            return vscode.workspace.openTextDocument(buildPath).then((textDoc) => {
                return vscode.window.showTextDocument(textDoc);
            });
        } else {
            vscode.window.showErrorMessage('No path found for BUILD file :(');
        }
    });
}

export function activate(context: vscode.ExtensionContext) {
    const createComponentListener = vscode.commands.registerCommand('ngTemplates.create-component', (uri:vscode.Uri) => {
        if (!uri.fsPath) {
            vscode.window.showErrorMessage('No folder selected to contain new component');
            return;
        }

        getNameOfObject('NewComponent', 'Name of component class', 'TestComponent FooBarComponent').then((componentName) => {
            const name = getComponentNameParts(componentName);

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

    const findBuildListener = vscode.commands.registerCommand('ngTemplates.find-build', (uri: vscode.Uri) => {
        
        if (!uri.fsPath) {
            vscode.window.showErrorMessage('No folder selected to find a BUILD file');
            return;
        }
        goToBuild(path.dirname(uri.fsPath));
    });
    context.subscriptions.push(findBuildListener);
}

export function deactivate() {
}