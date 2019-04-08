import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { writeFile, findModules, ensureDot } from './file';
import {getComponentNameParts, getSelectorName, getPrefix, getModuleClassName} from './naming';

export function toLowerCamelCase(upperCamelCase: string): string {
    return upperCamelCase[0].toLowerCase() + upperCamelCase.slice(1);
}

export function autoProvidesPath(filename: string, tsProjectDir: string): string {
    return ensureDot(path.join(path.relative(path.dirname(filename), tsProjectDir), 'autoprovides.generated'));
}

export function findTsProject(filename: string): string|null {
    const dir = path.dirname(filename);

    if (fs.existsSync(path.join(dir, 'tsconfig.json')) || fs.existsSync(path.join(dir, 'tsconfig.src.json')))
    {
        return dir;
    }
    else if (dir === '.')
    {
        return null;
    }
    else
    {
        return findTsProject(dir);
    }
}

export async function findPrimaryExport(inFile: string): Promise<string|null> {
    let expectedClassName = path.basename(inFile, '.ts');

    if (expectedClassName.endsWith('.component')) {
        expectedClassName = expectedClassName.slice(0, -('.component'.length)) + 'component';
    }

    const doc = await vscode.workspace.openTextDocument(inFile);

    const regex = new RegExp(`export class (${expectedClassName})`, 'gmi');

    const match = regex.exec(doc.getText());

    if (match) {
        return match[1];
    }

    return null;
}

export type ModuleInfo = {modulePath: string, moduleName: string};

export async function findModuleForClass(filename: string, className: string): Promise<ModuleInfo|null> {
    const modulesToCheck = await findModules(path.dirname(filename));

    for (let modulePath of modulesToCheck) {
        const doc = await vscode.workspace.openTextDocument(modulePath);
        const text = await doc.getText();

        if (text.indexOf(className) !== -1) {
            const lowercaseName = path.basename(modulePath, '.module.ts');
            const moduleClassName = getModuleClassName(getPrefix(), [lowercaseName]);

            console.log(moduleClassName);

            const moduleNameFinder = new RegExp(`export class (${moduleClassName})`, 'gmi');
            const match = moduleNameFinder.exec(text);

            if (match) {
                const relativeModulePath = path.relative(path.dirname(filename), modulePath.slice(0, -('.ts'.length)));

                return {
                    modulePath: relativeModulePath[0] === '.' ? relativeModulePath : ('./' + relativeModulePath),
                    moduleName: match[1],
                };
            }
        }
    }

    return null;
}

export function generateBlankTest() {
    return `
describe(module.id, () => {
    it('should work', () => {
        // TODO write test code
    });
});`;
}

export function generateClasslessTest(autoProvidesDir: string) {
    return `import {setupInjector} from '@lucid/testing/testsetup';

import {mockProvides} from '${autoProvidesDir}';

describe(module.id, () => {
    it('should work', () => {
        const injector = setupInjector(mockProvides);

        // TODO write test code
    });
});`;
}

export function generateClassTest(className: string, filename: string, autoProvidesDir: string) {
    return `import {setupInjector} from '@lucid/testing/testsetup';

import {${className}} from './${path.basename(filename, '.ts')}';

import {mockProvides} from '${autoProvidesDir}';

describe(module.id, () => {
    it('should work', () => {
        const injector = setupInjector([
            mockProvides,
            // Providing the class here ensures that a mock version isn't injected instead
            ${className},
        ]);

        const ${toLowerCamelCase(className)} = injector.get(${className});

        // TODO write test code
    });
});`;
}

export function generateComponentTestWithTestModule(className:string, filename: string, autoProvidesDir: string, moduleName: ModuleInfo, asyncAwait: boolean) {
    const nameParts = getComponentNameParts(className);
    const selectorName = getSelectorName(getPrefix(), nameParts);

    return `import {Component, NgModule} from '@angular/core';
import {ng2AutoProvides} from '@lucid/ng2testing/injector';
import {TestEnvironment} from '@lucid/ng2testing/testenvironment';
import {testComponent, testModule} from '@lucid/ng2testing/testmodule';
${generateMockClockImports(filename, asyncAwait)}

import {${moduleName.moduleName}} from '${moduleName.modulePath}';
import {mockProvides, ngMockProvides} from '${autoProvidesDir}';

@Component({
    template: '<${selectorName}></${selectorName}>',
    providers: [
        ng2AutoProvides(mockProvides, ngMockProvides),
    ],
})
class Test${className} {
}

@NgModule({
    declarations: [Test${className}],
    imports: [${moduleName.moduleName}],
})
class TestModule {}

describe(
    module.id,
    testModule(
        {
            module: TestModule,
        },
        () => {
            ${generateTest('Test' + className, asyncAwait)}
        }
    )
);`
}


export function generateComponentTest(className:string, filename: string, autoProvidesDir: string, moduleName: ModuleInfo, asyncAwait: boolean) {
    return `import {TestEnvironment} from '@lucid/ng2testing/testenvironment';
import {testComponent, testModule} from '@lucid/ng2testing/testmodule';
${generateMockClockImports(filename, asyncAwait)}

import {${className}} from './${path.basename(filename, '.ts')}';

import {${moduleName.moduleName}} from '${moduleName.modulePath}';
import {mockProvides, ngMockProvides} from '${autoProvidesDir}';

describe(
    module.id,
    testModule(
        {
            module: ${moduleName.moduleName},
            lucidProvides: mockProvides,
            ngProvides: ngMockProvides,
        },
        () => {
            ${generateTest(className, asyncAwait)}
        }
    )
);`;
}

export function generateTest(className: string, asyncAwait: boolean): string {
    if (asyncAwait) {
        return `it('should show calendar on click', testComponent({}, async (testEnv: TestEnvironment) => {
                await asyncAwaitMockClock(async mockClock => {
                    const interactions = new AsyncMockInteractions(mockClock);
                    const fixture = testEnv.createComponent(${className});
                    fixture.detectChanges();
                });
            }));`;
    } else {
        return `it('should show calendar on click', testComponent({}, (testEnv: TestEnvironment) => {
                fakeAsyncWrapper((stabilize, mockClock) => {
                    const fixture = testEnv.createComponent(${className});
                    fixture.detectChanges();
                })();
            }));`;
    }
}

export function generateMockClockImports(filename: string, asyncAswait: boolean): string {
    if (asyncAswait) {
        return `import {asyncAwaitMockClock} from '@lucid/pipelinedeps/test/asyncmockclock';
import {AsyncMockInteractions} from '@lucid/ng2testing/asyncmockinteractions';`;
    } else {
        const ng2commonLocation = filename.indexOf('ng2common');
        if (ng2commonLocation === -1) {
            return `import {fakeAsyncWrapper} from '@lucid/ng2common/test/util';`;
        } else {
            const relativePath = ensureDot(path.relative(
                path.dirname(filename), 
                filename.substr(0, ng2commonLocation) + 'ng2common/test/util'
            ));
            return `import {fakeAsyncWrapper} from '${relativePath}';`;
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    const createUnitTestListener = vscode.commands.registerCommand('ngTemplates.create-unit-test', async (uri:vscode.Uri) => {
        if (!uri.fsPath) {
            vscode.window.showErrorMessage('No file selected to make test of. Select a .ts file to create a unit test');
            return;
        }

        if (path.extname(uri.fsPath) !== '.ts') {
            vscode.window.showErrorMessage('You can only add unit tests to .ts files');
            return;
        }

        try 
        {
            const componentPath = uri.fsPath.slice(0, -3) + '.spec.ts';

            if (fs.existsSync(componentPath)) {
                vscode.window.showErrorMessage(`A test file with the name ${componentPath} already exists`);
                return;
            }
    
            const className = await findPrimaryExport(uri.fsPath);
            const tsProjectDir = findTsProject(uri.fsPath);
            const autoProvideDir = tsProjectDir && autoProvidesPath(uri.fsPath, tsProjectDir);
            const filename = uri.fsPath;
            let testContent = '';
    
            if (filename.endsWith('.component.ts') && className && tsProjectDir && autoProvideDir) {
                const moduleInfo = await findModuleForClass(uri.fsPath, className);

                if (moduleInfo) {
                    const useHtmlOptions = ['Create with test html (Required for PopupAnchor)', 'Create with no test html'];
                    const createTestHtml = await vscode.window.showQuickPick(useHtmlOptions, {
                        placeHolder: 'Create a test module?',
                    });

                    const useAsyncAwaitOptions = ['Use async/await mock clock', 'Use fakeAsyncWrapper, not compatible with async/await'];
                    const mockClock = await vscode.window.showQuickPick(useAsyncAwaitOptions, {
                        placeHolder: 'What kind of mock clock?',
                    });

                    const useAsyncAswait = mockClock === useAsyncAwaitOptions[0];

                    if (createTestHtml === useHtmlOptions[0]) {
                        testContent = generateComponentTestWithTestModule(className, filename, autoProvideDir, moduleInfo, useAsyncAswait);
                    } else {
                        testContent = generateComponentTest(className, filename, autoProvideDir, moduleInfo, useAsyncAswait);
                    }
                } else {
                    testContent = '// could not find module for component being tested';
                }
            } else if (className && autoProvideDir) {
                testContent = generateClassTest(className, filename, autoProvideDir);
            } else if (autoProvideDir) {
                testContent = generateClasslessTest(autoProvideDir);
            } else {
                testContent = generateBlankTest();
            }

            await writeFile(componentPath, testContent);
            const textDoc = await vscode.workspace.openTextDocument(componentPath);
            await vscode.window.showTextDocument(textDoc);
        } catch (err) {
            vscode.window.showErrorMessage(err.toString());
            console.error(err);
        }
    });
    context.subscriptions.push(createUnitTestListener);
}

export function deactivate() {

}