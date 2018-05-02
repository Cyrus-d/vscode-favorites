import * as fs from "fs";

import * as _ from "lodash";

import * as path from "path";
import * as vscode from "vscode";
import { GroupQuickPick, ResourceType, StoredResource } from "../types/index";
import { ViewItem } from "./view-item";
import workspace from "./workspace";

export class Favorites {
    constructor(private context: vscode.ExtensionContext) {

    }
    public generateGroupQuickPickList(): Promise<GroupQuickPick[]> {
        return new Promise((resolve, reject) => {

            const out: GroupQuickPick[] = [];

            Promise.all([
                this.get(),
            ]).then((result) => {
                const all = result[0];
                const root = all.filter((i) => i.type === ResourceType.Group && i.parent_id == null);

                const addChildren = (lastDepth: number, parentId: string) => {
                    const children = all.filter((i) => i.type === ResourceType.Group && i.parent_id === parentId);
                    const paddingLen: number = lastDepth + 1;
                    const padding = "".padStart(paddingLen, "—");

                    children.forEach((c, i) => {
                        const label = `${padding} ${c.name}`;
                        const o: GroupQuickPick = {
                            id: c.id,
                            label,
                            description: "",
                        };
                        out.push(o);
                        addChildren(lastDepth + 1, c.id);
                    });
                };

                root.forEach((g, i) => {
                    const o: GroupQuickPick = {
                        id: g.id,
                        label: g.name,
                        description: "",
                    };
                    out.push(o);
                    addChildren(0, g.id);
                });

                resolve(out);
            });
        });
    }
    public removeResource(id: string) {
        this.get()
            .then((result) => {

                const toDelete: string[] = [];
                toDelete.push(id);

                const collectChildren = (resourceId: string) => {
                    toDelete.push(resourceId);
                    const cc = result.filter((i) => i.parent_id === resourceId);
                    cc.forEach((sc) => {
                        collectChildren(sc.id);
                    });
                };

                const c = result.filter((i) => i.parent_id === id);

                c.forEach((e) => {
                    collectChildren(e.id);
                });

                const final = result.filter((i) => toDelete.find((x) => x === i.id) == null);

                this.save(final);

            })
            .catch((e) => {
                console.log(e);
            });
    }
    public addPathToGroup(groupId: string, itemPath: string) {
        return new Promise((resolve, reject) => {

            let all: StoredResource[] = null;
            Promise.all([
                this.get(),
            ]).then((result) => {
                all = result[0];

                const rPath = workspace.isMultiRootWorkspace() ? itemPath : itemPath.substr(workspace.getSingleRootPath().length + 1);
                const groupContents = all.filter((i) => i.parent_id === groupId);
                const hasPath = groupContents.filter((i) => i.type !== ResourceType.Group && i.name === itemPath);

                if (hasPath.length > 0) {
                    resolve();
                    return;
                }

                return this.identify(itemPath);

            }).then((t) => {

                const o = this.createResource(groupId, itemPath, t);
                all.push(o);
                return workspace.save("root", all);

            }).then(() => {
                resolve();
            }).catch((e) => {
                reject(e);
            });

        });
    }
    public removePathFromGroup(groupName: string, itemPath: string) {
        return new Promise((resolve, reject) => {

            Promise.all([
                this.get(),
                this.hasGroup(groupName),
            ])
                .then((result) => {
                    const all = result[0];
                    const has = result[1];

                    if (!has) {
                        resolve();
                        return;
                    }
                    const rPath = itemPath;
                    const index = all.findIndex((i) => i.name === groupName && i.type === ResourceType.Group);
                    const oPaths = all[index].contents ? all[index].contents : [];

                    if (!oPaths.find((i) => i === rPath)) {
                        resolve();
                        return;
                    }

                    const newPaths = oPaths.filter((i) => i !== rPath);

                    all[index].contents = newPaths.filter((i) => i.trim() !== "");

                    return workspace.save("root", all);

                }).then(() => {
                    resolve();
                }).catch((e) => {
                    reject(e);
                });

        });
    }

    public addGroup(parent_id: string, name: string) {
        return new Promise((resolve, reject) => {

            Promise.all([
                this.get(),
            ]).then((result) => {
                const all = result[0];

                const o = this.createResource(parent_id, name, ResourceType.Group);
                const newList: StoredResource[] = all.concat([o]);

                return workspace.save("root", newList);

            }).then(() => {
                resolve();
            }).catch((e) => {
                reject(e);
            });

        });
    }
    public removeGroup(name: string) {
        return new Promise((resolve, reject) => {

            this.get()
                .then((all) => {

                    const index = all.findIndex((i) => {
                        return i.name === name && i.type === ResourceType.Group;
                    });

                    if (index < 0) {
                        resolve();
                        return;
                    }

                    all.splice(index, 1);

                    workspace.save("root", all)
                        .then(() => {
                            resolve();
                        }).catch((e) => {
                            reject(e);
                        });

                })
                .catch((e) => {
                    reject(e);
                });

        });
    }
    // public addPath(itemPath: string) {
    //     return new Promise((resolve, reject) => {

    //         const rPath = workspace.isMultiRootWorkspace() ? itemPath : itemPath.substr(workspace.getSingleRootPath().length + 1);

    //         Promise.all([
    //             this.get(),
    //             this.hasPath(rPath),
    //             this.identify(itemPath),
    //         ])
    //             .then((result) => {
    //                 const all = result[0];
    //                 const has = result[1];
    //                 const type = result[2];

    //                 if (has) {
    //                     resolve();
    //                     return;
    //                 }
    //                 if (!type) {
    //                     vscode.window.showWarningMessage("Can't add path. Item is not file or directory");
    //                     resolve();
    //                 }

    //                 const o = this.createResource(null, rPath, type);
    //                 const newList: StoredResource[] = all.concat([o]);

    //                 return workspace.save("root", newList);

    //             }).then(() => {
    //                 resolve();
    //             }).catch((e) => {
    //                 reject(e);
    //             });

    //     });
    // }
    // public removePath(itemPath: string) {
    //     return new Promise((resolve, reject) => {

    //         this.get()
    //             .then((all) => {

    //                 const index = all.findIndex((i) => {
    //                     return i.name === itemPath && (i.type === ResourceType.File || i.type === ResourceType.Directory);
    //                 });

    //                 if (index < 0) {
    //                     resolve();
    //                     return;
    //                 }

    //                 all.splice(index, 1);

    //                 workspace.save("root", all)
    //                     .then(() => {
    //                         resolve();
    //                     }).catch((e) => {
    //                         reject(e);
    //                     });

    //             })
    //             .catch((e) => {
    //                 reject(e);
    //             });

    //     });
    // }
    public get(): Promise<StoredResource[]> {
        return new Promise((resolve, reject) => {
            const resources = workspace.get("root") as StoredResource[];
            const shouldConvert: boolean = resources.find((i) => i.id == null) == null ? false : true;

            if (shouldConvert === false) {
                resolve(resources);
                return;
            }

            const proms: Array<Promise<any>> = [];
            resources.forEach((e, i) => {
                resources[i].id = this.generateId();
                if (e.contents != null && e.contents.length > 0) {
                    e.contents.forEach((c, ci) => {

                        proms.push(this.identify(c)
                            .then((t) => {
                                const ce: StoredResource = {
                                    id: this.generateId(),
                                    name: c,
                                    parent_id: resources[i].id,
                                    type: t,
                                };
                                resources.push(ce);

                            }));
                    });

                    delete resources[i].contents;
                }
            });

            Promise.all(proms)
                .then(() => {
                    this.save(resources);
                    resolve(resources);

                }).catch((error) => {
                    console.log(error);
                });

        });
    }
    public save(list: StoredResource[]): Promise<void> {

        return workspace.save("root", list);
    }
    public identify(itemPath: string): Promise<ResourceType> {
        return new Promise((resolve, reject) => {
            fs.stat(workspace.pathResolve(itemPath), (err, stat: fs.Stats) => {

                if (err) {
                    resolve(null);
                    return;
                }

                const isDir = stat.isDirectory();
                const isFile = stat.isFile();

                if (isDir) {
                    resolve(ResourceType.Directory);
                    return;
                }
                if (isFile) {
                    resolve(ResourceType.File);
                    return;
                }

                resolve(null);

            });
        });
    }
    public groupViewItems(parentId: string): Promise<ViewItem[]> {
        const enablePreview = vscode.workspace.getConfiguration("workbench.editor").get("enablePreview") as boolean;
        const sortDirection = workspace.get("sortDirection");

        return new Promise((resolve, reject) => {
            Promise.all([
                this.get(),
            ]).then((result) => {
                const all = result[0];
                // tslint:disable-next-line:triple-equals
                const list: StoredResource[] = all.filter((i) => i.parent_id == parentId);

                this.sortStoredResources(list)
                    .then((sorted) => {
                        Promise.all(sorted.map((i) => this.asViewItem(i, this.context)))
                            .then((views) => {
                                resolve(views);
                            })
                            .catch((e) => {
                                reject(e);
                            });
                    })
                    .catch((e) => {
                        reject(e);
                    });

            }).catch((e) => {
                reject(e);
            });
        });
    }
    public sortStoredResources(list: StoredResource[]): Promise<StoredResource[]> {
        return new Promise((resolve, reject) => {
            try {

                const dirs = list.filter((i) => i.type === ResourceType.Directory);
                const files = list.filter((i) => i.type === ResourceType.File);
                const groups = list.filter((i) => i.type === ResourceType.Group);

                const sortDirection = workspace.get("sortDirection");
                const groupsFirst = workspace.get("groupsFirst");

                const groupsAZ = groups.sort((a, b) => {
                    const aBasename = a.name;
                    const bBasename = b.name;
                    if (aBasename < bBasename) { return -1; }
                    if (aBasename === bBasename) { return 0; }
                    if (aBasename > bBasename) { return 1; }
                });

                const dirsAZ = dirs.sort((a, b) => {
                    const aBasename = path.basename(a.name).toLocaleLowerCase();
                    const bBasename = path.basename(b.name).toLocaleLowerCase();
                    if (aBasename < bBasename) { return -1; }
                    if (aBasename === bBasename) { return 0; }
                    if (aBasename > bBasename) { return 1; }
                });

                const filesAZ = files.sort((a, b) => {
                    const aBasename = path.basename(a.name).toLocaleLowerCase();
                    const bBasename = path.basename(b.name).toLocaleLowerCase();
                    if (aBasename < bBasename) { return -1; }
                    if (aBasename === bBasename) { return 0; }
                    if (aBasename > bBasename) { return 1; }

                });

                let fsItems: StoredResource[];
                let groupsPrepared: StoredResource[];

                if (sortDirection === "ASC") {
                    fsItems = dirsAZ.concat(filesAZ);
                    groupsPrepared = groupsAZ;
                } else {
                    fsItems = dirsAZ.reverse().concat(filesAZ.reverse());
                    groupsPrepared = groupsAZ.reverse();
                }
                let final: StoredResource[];

                if (groupsFirst) {
                    final = groupsPrepared.concat(fsItems);
                } else {
                    final = fsItems.concat(groupsPrepared);
                }

                resolve(final);
            } catch (e) {
                reject(e);
            }

        });
    }

    public viewItemForPath(fsPath: string, context: string): Promise<ViewItem> {
        return new Promise((resolve, reject) => {
            const enablePreview = vscode.workspace.getConfiguration("workbench.editor").get("enablePreview") as boolean;
            Promise.all([this.identify(fsPath)])
                .then((result) => {
                    let o: ViewItem;
                    switch (result[0]) {
                        case ResourceType.File:
                            const fUri = workspace.pathAsUri(fsPath);
                            o = new ViewItem(
                                path.basename(fsPath),
                                vscode.TreeItemCollapsibleState.None,
                                fsPath,
                                context,
                                fsPath,
                                ResourceType.File
                                , null,
                                {
                                    command: "vscode.open",
                                    title: "",
                                    arguments: [fUri, { preview: enablePreview }],
                                },
                            );
                            break;
                        case ResourceType.Directory:
                            o = new ViewItem(
                                path.basename(fsPath),
                                vscode.TreeItemCollapsibleState.Collapsed,
                                fsPath,
                                context,
                                fsPath,
                                ResourceType.Directory
                                , null);
                            break;
                    }
                    resolve(o);
                })
                .catch((e) => {
                    reject(e);
                });

        });
    }
    public asViewItem(i: StoredResource, context: vscode.ExtensionContext): ViewItem {
        const enablePreview = vscode.workspace.getConfiguration("workbench.editor").get("enablePreview") as boolean;

        let o: ViewItem = null;
        switch (i.type) {
            case ResourceType.File:
                const fUri = workspace.pathAsUri(i.name);
                o = new ViewItem(
                    path.basename(i.name),
                    vscode.TreeItemCollapsibleState.None,
                    i.name,
                    "FAVORITE",
                    i.name,
                    i.type,
                    null, // NO ICON
                    {
                        command: "vscode.open",
                        title: "",
                        arguments: [fUri, { preview: enablePreview }],
                    },
                    i.id,
                    i.parent_id,
                );

                break;
            case ResourceType.Directory:
                o = new ViewItem(
                    path.basename(i.name),
                    vscode.TreeItemCollapsibleState.Collapsed,
                    i.name,
                    "FAVORITE",
                    i.name,
                    i.type,
                    null,
                    null,
                    i.id,
                    i.parent_id,
                )
                    ;

                break;
            case ResourceType.Group:
                o = new ViewItem(
                    i.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    i.name,
                    "FAVORITE_GROUP",
                    i.name,
                    i.type,
                    {
                        light: context.asAbsolutePath(path.join("images", "group_light.svg")),
                        dark: context.asAbsolutePath(path.join("images", "group_dark.svg")),
                    },
                    null,
                    i.id,
                    i.parent_id,

                );
                break;
        }
        return o;
    }
    private hasPath(itemPath): Promise<boolean> {
        return new Promise((resolve, reject) => {

            this.get()
                .then((all) => {
                    const item = all
                        .find((i) => i.name === itemPath && (i.type === ResourceType.File || i.type === ResourceType.Directory));

                    if (item) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }

                })
                .catch((e) => {
                    reject(e);
                });

        });
    }
    private hasGroup(name: string): Promise<boolean> {
        return new Promise((resolve, reject) => {

            this.get()
                .then((all) => {
                    const item = all
                        .find((i) => i.name === name && i.type === ResourceType.Group);

                    if (item) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }

                })
                .catch((e) => {
                    reject(e);
                });

        });
    }
    private createResource(parent_id: string, name: string, type: ResourceType): StoredResource {
        const o: StoredResource = {
            type,
            name,
            parent_id,
            id: this.generateId(),
        };

        return o;
    }
    private generateId(): string {
        return _.sampleSize("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 16).join("");
    }

}
