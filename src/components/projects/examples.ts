import scattering from "@fixtures/demo/scattering.spec.json";
import layerStack from "@fixtures/demo/layer_stack.spec.json";
import bragg from "@fixtures/demo/bragg.spec.json";
import periodic from "@fixtures/demo/periodic.spec.json";
import mode from "@fixtures/demo/mode.spec.json";
import bands from "@fixtures/demo/bands.spec.json";
import circuit from "@fixtures/demo/circuit.spec.json";

/** Example problems (one per kind) offered by the spec editor; the same ones the seed solves. */
export const EXAMPLE_SPECS: { id: string; label: string; spec: unknown }[] = [
  { id: "scattering", label: "Scattering: Drude nanosphere in water", spec: scattering },
  { id: "layer_stack", label: "Thin film: MgF₂ anti-reflection coating", spec: layerStack },
  { id: "bragg", label: "Thin film: TiO₂/MgF₂ Bragg mirror", spec: bragg },
  { id: "periodic", label: "Grating: TiO₂ lines on glass (RCWA)", spec: periodic },
  { id: "mode", label: "Waveguide: 500 × 220 nm silicon strip (FDE)", spec: mode },
  { id: "bands", label: "Photonic crystal: square lattice of rods (PWE)", spec: bands },
  { id: "circuit", label: "Circuit: Mach–Zehnder interferometer", spec: circuit },
];
