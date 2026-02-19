import 'server-only';

export async function importExternalModule<T = unknown>(moduleName: string): Promise<T> {
  const importer = new Function('name', 'return import(name);') as (name: string) => Promise<T>;
  return importer(moduleName);
}
