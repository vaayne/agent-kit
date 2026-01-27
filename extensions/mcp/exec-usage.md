# MCP Exec Usage Guide

The `mcp_exec` tool allows you to run JavaScript code that orchestrates multiple MCP tool calls with full programming logic.

## Workflow

Before using `mcp_exec`, follow this workflow:

```
1. mcp_list           → Discover available tools
2. mcp_inspect <tool> → Get full tool signature (JSDoc)
3. mcp_exec '<code>'  → Execute JavaScript with tool calls
```

## JavaScript Runtime

### Available APIs

| API                          | Description              |
| ---------------------------- | ------------------------ |
| `mcp.callTool(name, params)` | Call an MCP tool (async) |
| `mcp.listTools()`            | List available tools     |

### NOT Available

| API          | Reason                                       |
| ------------ | -------------------------------------------- |
| `fetch`      | No network access - use MCP tools instead    |
| `fs`, `path` | No filesystem access - use MCP tools instead |
| `require`    | No module imports                            |

## Code Patterns

### Simple Single Call

```javascript
const result = await mcp.callTool("webSearch", { query: "MCP protocol" });
return result;
```

### Chaining Tool Calls

```javascript
// Get user, then send notification
const user = await mcp.callTool("getUser", { id: 123 });
await mcp.callTool("sendEmail", {
  to: user.email,
  subject: "Hello",
  body: "Hi " + user.name,
});
return "Done";
```

### Using Variables and Logic

```javascript
const repos = await mcp.callTool("githubSearch", { query: "mcp", perPage: 10 });

// Filter and process results
const popular = repos.filter(r => r.stars > 100);

// Return processed data
return popular.map(r => ({ name: r.name, stars: r.stars }));
```

### Loop Through Items

```javascript
const ids = [1, 2, 3, 4, 5];
const results = [];

for (const id of ids) {
  const data = await mcp.callTool("getItem", { id });
  results.push(data);
}

return results;
```

### Error Handling

```javascript
const ids = [1, 2, 999]; // 999 doesn't exist

const results = [];
for (const id of ids) {
  try {
    const user = await mcp.callTool("getUser", { id });
    results.push({ id, ok: true, data: user });
  } catch (e) {
    results.push({ id, ok: false, error: e.message });
  }
}

return results;
```

### Conditional Logic

```javascript
const user = await mcp.callTool("getUser", { id: 123 });

if (user.isPremium) {
  await mcp.callTool("notify", {
    channel: "#vip",
    message: `VIP: ${user.name}`,
  });
} else {
  await mcp.callTool("notify", {
    channel: "#general",
    message: `User: ${user.name}`,
  });
}

return "Notified";
```

## Tips

1. **Use `mcp_inspect` first** - Always check the tool signature before calling it
2. **Use `await`** - `mcp.callTool()` is async, always await it
3. **Return results** - Use `return` to output the final result
4. **Handle errors** - Wrap tool calls in try/catch for resilience
5. **Keep it simple** - Complex logic is better handled with multiple simple calls
