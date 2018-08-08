import * as path from "path";
import { fromEventPattern, merge, Subject } from "rxjs";
import { filter } from "rxjs/operators";
import * as vscode from "vscode";
import { ResourceType, StoredResource } from "../types/index";
import { DataProvider } from "./dataProvider";
import { Favorites } from "./favorites";
import { ViewItem } from "./view-item";

export class TreeViewManager {
    public visible: boolean = false;
    public activeEditor: vscode.TextEditor = null;
    private eventVisibility = new Subject<boolean>();
    private eventReveal = new Subject<string>();
    private eventActiveEditor = new Subject<vscode.TextEditor>();

    constructor(
        private treeView: vscode.TreeView<ViewItem>,
        private context: vscode.ExtensionContext,
        private favorites: Favorites,
        private treeProvider: DataProvider,
    ) {

        this.visible = this.treeView.visible;
        this.activeEditor = vscode.window.activeTextEditor;

        fromEventPattern<vscode.TreeViewVisibilityChangeEvent>((f: (e: any) => any) => {
            return this.treeView.onDidChangeVisibility(f, null, context.subscriptions);
        }, (f: any, d: vscode.Disposable) => {
            d.dispose();
        }).pipe().subscribe((m) => {
            this.visible = m.visible;
            this.eventVisibility.next(m.visible);
        });

        fromEventPattern<vscode.TextEditor>((f: (e: any) => any) => {
            return vscode.window.onDidChangeActiveTextEditor(f, null, context.subscriptions);
        }, (f: any, d: vscode.Disposable) => {
            d.dispose();
        }).pipe().subscribe((m) => {
            this.activeEditor = m;
            this.eventActiveEditor.next(m);
        });

        merge(
            this.eventActiveEditor.pipe(),
            this.eventVisibility.pipe(),
        ).pipe(
            filter(() => {
                return (
                    this.activeEditor != null &&
                    this.activeEditor.document != null &&
                    this.activeEditor.document.uri.fsPath != null
                );
            }),
            filter(() => this.visible === true),
        ).subscribe((editor) => {
            this.reveal(this.activeEditor.document.uri.fsPath);
        });

        this.eventActiveEditor.next(this.activeEditor);
    }
    public reveal(fsPath: string) {

        Promise.all([
            this.favorites.identify(fsPath),
            this.favorites.get(),
        ]).then((result) => {
            const type = result[0];
            const list = result[1];

            // try to locate in favorite items! directly added
            const fileItem = list.find((f) => f.name === fsPath && f.type === ResourceType.File);

            // if file and in root!
            if (fileItem && type === ResourceType.File) {
                // it is file in root!
                const viewItem = this.favorites.asViewItem(fileItem);
                this.treeView.reveal(viewItem, { select: true, focus: true });

                return;
            }

            const isPart = this.isPartOfFavorites(fsPath, list);

            if (isPart) {
                this.favorites.viewItemForPath(fsPath)
                    .then((item) => {
                        this.treeView.reveal(item, { select: true, focus: true });
                        return;
                    }).catch((e) => {
                        console.log(e);
                    });

            }

        }).catch((e) => {
            console.log(e);
        });

    }

    private isPartOfFavorites(fsPath: string, list: StoredResource[]): boolean {
        const dir = path.dirname(fsPath);
        const splits = dir.split(path.sep);

        const findDirect = list.find((sr) => sr.name === dir && sr.type === ResourceType.Directory);

        if (findDirect) {
            return true;
        }
        let currentDir = dir;
        for (let i = 0; i < splits.length; i++) {
            const p = path.join(currentDir, "..");
            const f = list.find((sr) => sr.name === p && sr.type === ResourceType.Directory);
            if (f) {
                return true;
            }
            currentDir = p;
        }

        return false;
    }

}