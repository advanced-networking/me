const metadata = [
  { attr: "imports", name: "Imports" },
  { attr: "toposetup", name: "Topology" },
  { attr: "nodes", name: "Add nodes", indent: 8 },
  { attr: "links", name: "Add links", indent: 8 },
  { attr: "ports", name: "Add interfaces", indent: 8 },
  { attr: "nodeLimits", name: "Add node limits", indent: 8 },
  { attr: "ips", name: "Add IP addresses", indent: 8 },
];

export default class {
  constructor(name) {
    this.name = name;
    this.imports = [
      "from mininet.net import Mininet",
      "from mininet.topo import Topo",
      "import mininet.link",
      "import mininet.log",
      "import mininet.node",
    ];

    // Init empty arrays
    metadata.forEach(({ attr }) => {
      if (!this[attr]) {
        this[attr] = [];
      }
    });

    this.toposetup = [
      `class ${this.name}(Topo):`,
      "    def build(self):",
    ];
    this.controllerArgs = [];
    this.mininetArgs = ["--link=tc"];
  }

  toString() {
    const code = [];
    metadata.forEach(({ attr, name, indent }) => {
      const indent_ = indent ?? 0;
      const arr = this[attr]
        .map((v) => v.apply ? v.apply() : v)
        .map((s) => " ".repeat(indent_) + s);

      if (arr.length) {
        code.push(
          `# ${name} {{{`,
          "",
          ...arr,
          "",
          "# }}}",
        );
      }
    });

    const topologies = `topos = {"${this.name}": ${this.name}}`;
    const mnargs = this.mininetArgs.join(" ");
    const cargs = this.controllerArgs.length != 0 ? ` --controller ${this.controllerArgs.join(",")} ` : "";
    const mnStuff = `# run with 'sudo mn ${cargs}${mnargs} --custom <topology.py> --topo ${this.name}'`;

    return [
      ...code,
      topologies,
      mnStuff,
    ].join("\n");
  }
}
