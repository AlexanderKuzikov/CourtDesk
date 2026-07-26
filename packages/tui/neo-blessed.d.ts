declare module 'neo-blessed' {
  const blessed: {
    screen(options?: Record<string, unknown>): any;
    box(options?: Record<string, unknown>): any;
    log(options?: Record<string, unknown>): any;
    list(options?: Record<string, unknown>): any;
  };
  export default blessed;
}

