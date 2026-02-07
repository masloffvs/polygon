import type React from "react";

export interface NodeRendererProps {
	data: any; // The latest output result from the node
	nodeData: any; // The node's configuration/metadata
}

export type NodeRendererComponent = React.FC<NodeRendererProps>;

// Registry map
const renderers: Record<string, NodeRendererComponent> = {};

export const registerRenderer = (
	typeId: string,
	component: NodeRendererComponent,
) => {
	renderers[typeId] = component;
};

export const getRenderer = (
	typeId: string,
): NodeRendererComponent | undefined => {
	return renderers[typeId];
};
