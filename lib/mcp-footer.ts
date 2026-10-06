type FooterTool = {
	name: string;
	exposure?: string;
	namespace?: { name: string };
};

/** Include indirect native tools; withdrawn/hidden tools must not keep a server listed. */
export function mcpServerNamesFromTools(tools: readonly FooterTool[]): string[] {
	const names = tools.filter((tool) => tool.exposure !== "hidden").map((tool) => {
		const namespace = /^mcp__([\w-]+)$/u.exec(tool.namespace?.name ?? "")?.[1];
		if (namespace) return namespace;
		// Native tools are mcp__server__tool; legacy adapter tools are mcp__server.
		return /^mcp__(\w+?)__/u.exec(tool.name)?.[1]
			?? /^mcp__([\w-]+)$/u.exec(tool.name)?.[1];
	});
	return [...new Set(names.filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
}
