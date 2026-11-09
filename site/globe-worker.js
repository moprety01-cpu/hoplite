// Runs one frame of globe.js exactly as node would, and returns what it printed.
const realConsole = self.console;
onmessage = ({ data }) => {
  let out = null;
  self.console = { log: (s) => { out = s; } };
  try {
    (0, eval)(data); // global, sloppy-mode eval: the program assigns globals just like a node script
    postMessage(typeof out === 'string' ? { out: out + '\n' } : { error: 'программа ничего не напечатала' });
  } catch (e) {
    postMessage({ error: String(e) });
  } finally {
    self.console = realConsole;
  }
};
