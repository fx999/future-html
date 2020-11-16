import { boundAttributeSuffix, endsWith, deleteSuffix, marker, diff } from './tools'
import { TemplateResult } from './result'
import { NodeType, Vnode, VnodeAttribute } from './interfaces'
import { render } from './render';
import { containerMap } from './tools'
export class Process {
    public tempalte: Node;
    public values: unknown[];
    public bindNodes: Vnode[] = [];
    constructor(tempalte: HTMLTemplateElement, values: unknown[]) {
        this.tempalte = this.pretreatment(tempalte.content, values);

    }
    pretreatment(content: DocumentFragment, values: unknown[]) {
        const iterator = document.createNodeIterator(
            content,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT
        );
        let node = null;
        let index = -1;
        while ((node = iterator.nextNode())) {
            switch (node.nodeType) {
                case NodeType.NODE:
                    if (node.hasAttributes()) {
                        //node节点
                        const attributes = [...node.attributes];
                        const preAttr = attributes.filter((attr) =>
                            endsWith(attr.name, boundAttributeSuffix)
                        );
                        const { length } = preAttr;
                        const vnode = length ? { node, attributes: [] } : null;
                        for (let i = 0; i < length; i++) {
                            index++;
                            const attr = preAttr[i];
                            const name = deleteSuffix(preAttr[i].name, boundAttributeSuffix);
                            node.removeAttribute(attr.name);
                            const prefix = name[0];
                            if (prefix === "@") {
                                node.addEventListener(
                                    name.slice(1).toLowerCase(),
                                    values[index]
                                );
                            } else {
                                vnode.attributes.push({
                                    name: name,
                                    value: values[index],
                                    index,
                                });
                                node.setAttribute(name, values[index]);
                                // if (prefix === ":") {
                                //     //TODO
                                //     node.setAttribute(name.slice(1), values[index]);
                                // } else if (prefix === "?") {
                                //     if (values[index]) {
                                //         node.setAttribute(name.slice(1), values[index]);
                                //     }
                                //     //TODO
                                // } else {
                                //     node.setAttribute(name.slice(1), values[index]);
                                // }
                            }
                        }
                        vnode?.attributes.length && this.bindNodes.push(vnode);
                    }
                    break;
                case NodeType.COMMENT:
                    //注释节点
                    if (node.data === marker) {
                        index++;
                        let childerNode = null;
                        const parent = node.parentNode;
                        const vnodes: Vnode[] = [];
                        if (values[index] instanceof TemplateResult) {
                            node.remove();
                            const result = <TemplateResult>values[index];
                            render(result, parent)
                        } else if (values[index] instanceof Node) {
                            childerNode = values[index];
                            parent.replaceChild(childerNode, node);
                        } else if (values[index] instanceof Array) {
                            node.remove();
                            const arr = <Array<unknown>>values[index];
                            const template = document.createDocumentFragment();
                            for (let i = 0; i < arr.length; i++) {

                                if (arr[i] instanceof TemplateResult) {
                                    const tem = document.createDocumentFragment();

                                    render(<TemplateResult>arr[i], tem);
                                    // console.log([...Array.from(tem.childNodes)]);
                                    vnodes.push({
                                        node: tem,
                                        childNodes: [...Array.from(tem.childNodes)],
                                        value: arr[i],
                                        index: i,
                                        parent
                                    });

                                } else if (arr[i] instanceof Node) {
                                    vnodes.push({
                                        node: <Node>arr[i],
                                        value: arr[i],
                                        index: i
                                    });

                                } else {
                                    const text = document.createTextNode(<string>arr[i]);
                                    vnodes.push({
                                        node: text,
                                        value: arr[i],
                                        index: i
                                    });
                                }

                            }
                            // console.log(vnodes)
                            template.append(... (<Node[]>vnodes.map(node => node.node)))
                            parent.append(template);
                        }
                        else {
                            childerNode = document.createTextNode(<string>values[index]);
                            parent.replaceChild(childerNode, node);
                        }
                        if (values[index] instanceof Array) {
                            const vnode: Vnode = {
                                node: vnodes,
                                value: values[index],
                                index,
                            }
                            vnodes.length && this.bindNodes.push(vnode);
                        } else {
                            const vnode: Vnode = {
                                node: childerNode,
                                value: values[index],
                                index,
                            }
                            childerNode && this.bindNodes.push(vnode);
                        }



                    }
                    break;

            }

        }

        return iterator.root;
    }
    commit(vnode: Vnode, value: unknown) {
        if (value instanceof Node) {
            (<Node>vnode.node).parentNode.replaceChild(<Node>value, <Node>vnode.node);
            vnode.node = <Node>value;
            vnode.value = value;
        } else if (value instanceof TemplateResult) {
            render(value, <Node>vnode.node);
        } else {
            if (diff(value, vnode.value)) {
                (<Node>vnode.node).nodeValue = <string>value;
                vnode.value = value;
            }
        }

    }
    patch(values: unknown[]) {
        this.bindNodes.forEach((vnode: Vnode) => {
            if (vnode.attributes) {
                //node
                vnode.attributes = vnode.attributes.map((attr: VnodeAttribute) => {
                    if (diff(values[attr.index], attr.value)) {
                        attr.value = values[attr.index];
                        (<Element>vnode.node).setAttribute(attr.name, <string>attr.value);
                    }
                    return attr;
                });
            } else {
                if (values[vnode.index] instanceof Array) {
                    const datas = <Array<unknown>>values[vnode.index];
                    for (let i = 0; i < datas.length; i++) {

                        if (datas[i] instanceof TemplateResult) {
                            if (vnode.node[i]?.node) {
                                this.commit(<Vnode>vnode.node[i], datas[i]);
                            } else {
                                const node = vnode.node[(<Vnode[]>vnode.node).length - 1].parent;
                                (<unknown[]>vnode.value).push(datas[i]);
                                const tmp = document.createDocumentFragment();
                                render(<TemplateResult>datas[i], tmp);
                                (<Vnode[]>vnode.node).push({
                                    node: tmp,
                                    childNodes: [...Array.from(tmp.childNodes)],
                                    value: datas[i],
                                    index: i,
                                    parent: node
                                });

                                node.append(vnode.node[i].node);
                            }
                        } else {
                            if (vnode.node[i]) {
                                this.commit({
                                    node: <Node>vnode.node[i].node,
                                    value: vnode.node[i].value,
                                }, datas[i]);
                            } else {
                                const node = vnode.node[(<Vnode[]>vnode.node).length - 1].node.parentNode;
                                const tmp = document.createDocumentFragment();
                                tmp.append(<string>datas[i]);
                                const [box] = [...Array.from(tmp.childNodes)];
                                (<Vnode[]>vnode.node).push({
                                    node: box,
                                    value: datas[i],
                                    index: i
                                });
                                node.append(tmp);
                            }

                        }


                    }
                    if (datas.length < (<Vnode[]>vnode.node).length) {
                        for (let i = datas.length; i < (<Vnode[]>vnode.node).length; i++) {
                            if (datas[i] instanceof TemplateResult) {
                                containerMap.delete(vnode.node[i]);
                                vnode.node[i].childNodes.forEach(node => {
                                    node.remove();
                                });
                                (<Vnode[]>vnode.node).splice(i, 1);
                                (<unknown[]>vnode.value).splice(i, 1);
                            } else if (datas[i] instanceof Node) {
                                containerMap.delete(vnode.node[i]);
                                const arr = (<Vnode[]>vnode.node).splice(i, (<Vnode[]>vnode.node).length);
                                (<unknown[]>vnode.value).splice(i, (<Vnode[]>vnode.value).length);
                                arr.forEach((node: Vnode) => {
                                    (<Element>node.node).remove();
                                })
                            } else {
                                const arr = (<Vnode[]>vnode.node).splice(i, (<Vnode[]>vnode.node).length);
                                (<unknown[]>vnode.value).splice(i, (<Vnode[]>vnode.value).length);
                                arr.forEach((node: Vnode) => {
                                    (<Element>node.node).remove();
                                });
                            }

                        }
                    }
                } else {
                    this.commit(vnode, values[vnode.index]);

                }

            }
        })

    }
}