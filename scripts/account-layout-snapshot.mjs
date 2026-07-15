const DEPLOYED_ACCOUNTS = ['Config', 'ChildProfile', 'Milestone', 'Deposit', 'Treasury'];

export function snapshotAccountLayouts(source) {
  return Object.fromEntries(
    DEPLOYED_ACCOUNTS.map((name) => {
      const body = new RegExp(`pub struct ${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm').exec(source)?.[1];
      if (!body) throw new Error(`Missing deployed account struct: ${name}`);
      const fields = [...body.matchAll(/pub\s+([a-z][a-z0-9_]*)\s*:/g)].map((match) => match[1]);
      if (fields.length === 0) throw new Error(`Deployed account has no fields: ${name}`);
      return [name, fields];
    }),
  );
}
