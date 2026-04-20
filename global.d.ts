declare module "*.css" {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    mappls?: any;
  }
}

export {};
