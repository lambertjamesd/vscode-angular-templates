import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function writeFile(path: string, content: string): Promise<any> {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, content, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(1);
            }
        });
    });
}

export function findModules(inDirectory: string): Promise<string[]> {
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

export function findBuild(inDirectory: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readdir(inDirectory, (err, items) => {
            if (err) {
                reject(err);
            } else {
                const index = items.indexOf('BUILD.bazel');

                if(index != -1) {
                    resolve(path.join(inDirectory, 'BUILD.bazel'));
                }

                const next = path.join(inDirectory, '..');

                const doNext = (vscode.workspace.workspaceFolders || []).some((folder) => {
                    return path.relative(folder.uri.fsPath, next).substr(0, 2) !== '..';
                });

                if (doNext) {
                    findBuild(next).then((moreBuilds) => {
                        resolve(moreBuilds);
                    }, reject);
                } else {
                    reject('Could not find BUILD file.');
                }
            }
        });
    });
}

export function ensureDot(relativePath: string): string {
    if (relativePath[0] === '.') {
        return relativePath;
    } else {
        return './' + relativePath;
    }
}