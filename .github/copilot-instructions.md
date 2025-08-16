# IMPORTANT

- Never try to fix linter errors and warnings yourself, most of the time they are autofixable, so just leave them and let me do it, you don't even need to mention them.
- The terminal is Windows CMD, so linux commands are not available.
- No need to care about backwards compatibility, no one uses the app, we change what we want.

## SolidJS

### Errors

- eslint solid/reactivity: The reactive variable 'props.x' should be used within JSX, a tracked scope (like createEffect), or inside an event handler function, or else changes will be ignored.
  - if you want the signal to be reactive, use createMemo
  - if you also want to mutate the signal, use createWritableMemo
  - otherwise just use untrack
