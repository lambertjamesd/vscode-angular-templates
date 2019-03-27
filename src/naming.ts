import * as vscode from 'vscode';


export function camelCase(nameParts: string[], capitalizeFirst: boolean) {
    return nameParts.map((part, index) => ((capitalizeFirst || index !== 0) ? part[0].toUpperCase() : part[0].toLowerCase()) + part.substr(1)).join('');
}

export function getNameParts(name: string): string[] {
    return name.trim().replace(/([a-z](?=[A-Z]))/g, '$1\n').split('\n').map(part => part.toLowerCase()).filter(a => a.length > 0);
}

export function getComponentNameParts(componentName: string): string[] {
    const nameParts = getNameParts(componentName);

    if (nameParts[nameParts.length - 1] === 'component') {
        nameParts.pop();
    }

    return nameParts;
}

export function getSelectorName(prefix: string[], nameParts: string[]): string {
    if (prefix.length) {
        return `${prefix.join('-')}-${nameParts.join('-')}`;
    } else {
        return nameParts.join('-');
    }
}

export function getPrefix(): string[] {
    const result = vscode.workspace.getConfiguration('ngTemplates').prefix;

    if (typeof result === 'string') {
        return getNameParts(result);
    } else {
        return [];
    }
}

export function getModuleClassName(prefix: string[], nameParts: string[]): string {
    return camelCase(prefix.concat(nameParts), true) + 'Module';
}