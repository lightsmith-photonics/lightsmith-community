// Every product name, tagline and library command shown in the UI comes from here.
// The library is being renamed; change `library` once in this file when it ships.

export const brand = {
  product: "Lightsmith",
  community: "Lightsmith Community",
  studio: "Lightsmith Studio",
  cloud: "Lightsmith Cloud",
  materials: "Lightsmith Materials",
  tagline: "The open photonics suite — GPU-native, differentiable, and built for AI agents.",
  pitch: "From nanoparticles to photonic chips: one problem spec, many solvers, on CPU or GPU, for people and AI agents alike.",
  library: {
    /** PyPI distribution name */
    package: "lightsmith",
    install: "uv add lightsmith",
    installGpu: 'uv add "lightsmith[gpu]"',
    installMcp: 'uv add "lightsmith[mcp]"',
    cli: "lightsmith",
    /** import name and conventional alias in examples */
    module: "lightsmith",
    alias: "ls",
    mcpServer: "lightsmith-mcp",
    license: "MIT",
  },
  /** `iss` claim of the JWTs sent to the services (they only check it when configured to). */
  jwtIssuer: "lightsmith-community",
} as const;

export type Brand = typeof brand;
