import Code from "./Code";
import Items from "./Items";
import pyArgs from "./pyArgs";

export default class {
  constructor(data) {
    this.log = [];

    this._devnames = Object.create(null);
    this._hostnames = new Set();
    this._linked = new Set();

    this._data = data;
    this._items = new Items(data.items);
    this._code = new Code(data.projectName?.replaceAll(/\W/ig, "") ?? "Topology");
  }

  build() {
    [
      // Nodes (stop on hostname conflict)
      {
        items: this._items.arr.controller,
        method: this._addController.bind(this),
      },
      { items: this._items.arr.host, method: this._addHost.bind(this) },
      { items: this._items.arr.switch, method: this._addSwitch.bind(this) },

      // Interfaces (stop on devname conflict)
      { items: this._items.arr.port, method: this._addPort.bind(this) },

      // Links
      { items: this._items.arr.link, method: this._addLink.bind(this) },
    ].forEach(({ items, method }) => {
      items.forEach((item) => {
        try {
          method(item);
        } catch (error) {
          if (
            error instanceof SyntaxError &&
            error.message === "Hostname collision."
          ) {
            const hostname = item.hostname;
            [
              ...this._items.arr.controller,
              ...this._items.arr.host,
              ...this._items.arr.switch,
            ].filter((node) => node.hostname === hostname)
              .forEach((node) =>
                this._log(
                  `Failed to add ${node.type}/${node.hostname}: conflicting hostname.`,
                  "error",
                  node,
                )
              );
          } else if (
            error instanceof SyntaxError &&
            error.message === "Devname collision."
          ) {
            const { devname, ports } = error.payload;
            ports.forEach((port) =>
              this._log(
                `Failed to add ${port.type}/${port.hostname}: conflicting interface name ${devname}.`,
                "error",
                port,
              )
            );
          } else if (
            error instanceof SyntaxError &&
            error.message === "Multiple links per port."
          ) {
            const { port } = error.payload;
            this._log(
              `Failed to add ${port.type}/${port.hostname}: single port has multiple links.`,
              "error",
              port,
            );
          } else if (
            error instanceof SyntaxError &&
            error.message === "Physical port connected to a link."
          ) {
            const { port } = error.payload;
            this._log(
              `Failed to add ${port.type}/${port.hostname}: port can't be both physical and connected to a link.`,
              "error",
              port,
            );
          } else {
            console.error(error);
            this._log(
              item != null && item.type !== null && item.id !== null
                ? `Failed to add ${item.type}/${item.hostname}.`
                : `Malformed item (${
                  this._items.arr.$all.find((v) => v === item)
                }).`,
              "error",
              item,
            );
          }

          throw new Error("Script building failure.");
        }
      });
    });

    // Mininet arguments
    this._code.mininetArgs.push(...[
      this._data.autoSetMAC ? "--mac" : null,
      this._data.autoStaticARP ? "--arp" : null,
      this._data.inNamespace ? "--innamespace" : null,
      this._data.ipBase != null ? `--ipbase=${this._data.ipBase}` : null,
      this._data.listenPortBase != null
        ? `--listenport=${this._data.listenPortBase}`
        : null,
      this._data.spawnTerminals ? "--xterms" : null,
    ].filter((v) => v != null));

    return this._code.toString();
  }

  _addController(controller) {

    const cliNameMap = {
      'Controller': 'ref',
      'NOX': 'nox',
      'OVSController': 'ovsc',
      'RemoteController': 'remote',
      'Ryu': 'ryu'
    }

    this._code.controllerArgs.push(...[
      cliNameMap[controller.controllerType],
      controller.ip != null ? `ip=${controller.ip}` : null,
      controller.port != null ? `port=${controller.port}` : null,
      controller.protocol != null ? `protocol=${controller.protocol}` : null
    ].filter((v) => v != null));
  }

  _addHost(host) {
    this._addHostname(host);

    const args = pyArgs([
      [host.hostname, String],
      ["None", null, "ip"],
      [
        host.defaultRoute != null,
        `via ${host.defaultRoute}`,
        String,
        "defaultRoute",
      ],
      [
        [host.cpuScheduler, host.cpuCores, host.cpuLimit].some((v) =>
          v != null
        ),
        "mininet.node.CPULimitedHost",
        null,
        "cls",
      ],
    ]);
    this._code.nodes.push(`${host.hostname} = self.addHost(${args.join(", ")})`);

    if (host.cpuScheduler != null || host.cpuLimit != null) {
      const args = pyArgs([
        [host.cpuScheduler != null, host.cpuScheduler, String, "sched"],
        [host.cpuLimit != null, host.cpuLimit, Number, "f"],
      ]);
      this._code.nodeLimits.push(
        `${host.hostname}.setCPUFrac(${args.join(", ")})`,
      );
    }
    if (host.cpuCores != null) {
      const args = pyArgs([
        [host.cpuCores != null, host.cpuCores.join(","), String, "cores"],
      ]);
      this._code.nodeLimits.push(
        `${host.hostname}.setCPUs(${args.join(", ")})`,
      );
    }

    this._addNodeScripts(host.hostname, host.startScript, host.stopScript);
  }

  _addLink(link) {
    const fromPort = this._items.map.port[link.from];
    const toPort = this._items.map.port[link.to];

    this._addLinkedPort(fromPort);
    this._addLinkedPort(toPort);

    const fromNode = this._portToNode(fromPort);
    const toNode = this._portToNode(toPort);

    if (!fromNode || !toNode) {
      this._log(
        `Failed to add ${link.type}/${link.hostname}: link can't be connected to disconnected port(s).`,
        "warning",
        link,
      );
      [
        ...(fromNode ? [] : [fromPort]),
        ...(toNode ? [] : [toPort]),
      ].forEach((port) => {
        this._log(
          `Failed to add ${port.type}/${port.hostname}: port can't be connected to a link but not to a node.`,
          "warning",
          port,
        );
      });

      return;
    }

    const fromDev = `${fromNode.hostname}-${fromPort.hostname}`;
    const toDev = `${toNode.hostname}-${toPort.hostname}`;

    // someone please explain the brain rot that is going on inside mininet
    // https://github.com/mininet/mininet/blob/master/mininet/link.py#L188

    const fromParams = {
      ifconfig: ""
    };

    (fromPort.ips || []).forEach((ip, i) => {
      if (i == 0) {
        fromParams['ip'] = ip;
      }

      // this is such a hack, this ends up running all our iproute2 commands by
      // throwing them after the eventual ifconfig command

      fromParams.ifconfig += `; ip a a ${ip} dev ${fromDev}`
    });


    const toParams = {
      ifconfig: ""
    };

    (toPort.ips || []).forEach((ip, i) => {
      if (i == 0) {
        toParams['ip'] = ip;
      }

      // this is such a hack, this ends up running all our iproute2 commands by
      // throwing them after the eventual ifconfig command

      toParams.ifconfig += `; ip a a ${ip} dev ${fromDev}`
    });

    const args = pyArgs([
      [fromNode.hostname],
      [toNode.hostname],
      [fromDev, String, "intfName1"],
      [toDev, String, "intfName2"],
      [link.bandwidth != null, link.bandwidth, Number, "bw"],
      [link.delay != null, link.delay, String, "delay"],
      [link.loss != null, link.loss, Number, "loss"],
      [link.maxQueueSize != null, link.maxQueueSize, Number, "max_queue_size"],
      [link.jitter != null, link.jitter, String, "jitter"],
      [JSON.stringify(fromParams), null, "params1"],
      [JSON.stringify(toParams), null, "params2"],
    ]);

    this._code.links.push(`self.addLink(${args.join(", ")})`);
  }

  _addPort(port) {
    const node = this._portToNode(port);
    if (!node) {
      this._log(
        `Skipping ${port.type}/${port.hostname}: not connected to any node.`,
        "info",
        port,
      );
      return;
    }
    const link = port.$links[0];
    if (!link && !port.physical) {
      this._log(
        `Skipping ${port.type}/${port.hostname}: port has to be either physical or connected to a link.`,
        "info",
        port,
      );
      return;
    }
    if (link && port.physical) {
      const error = new SyntaxError("Physical port connected to a link.");
      error.payload = { port };
      throw error;
    }

    const dev = port.physical
      ? port.hostname
      : `${node.hostname}-${port.hostname}`;

    this._addDevname(port, dev);

    if (!link) {
      const args = pyArgs([
        [dev, String],
        [node.hostname, null, "node"],
      ]);
      this._code.ports.push(`mininet.link.Intf(${args.join(", ")})`);
    }

    // this now is handled in links
    //
    // (port.ips || []).forEach((ip, i) => {
    //   this._code.ips.push(
    //     ...(i === 0
    //       ? [
    //         `self.setlinkInfo()`
    //         `${node.hostname}.intf('${dev}').ip = '${ip.split("/")[0]}'`,
    //         `${node.hostname}.intf('${dev}').prefixLen = ${ip.split("/")[1]}`,
    //       ]
    //       : []),
    //     // `${node.hostname}.cmd('ip a a ${ip} dev ${dev}')`,
    //   );
    // });
  }

  _addSwitch(swtch) {
    this._addHostname(swtch);

    const args = pyArgs([
      [swtch.hostname, String],
      [swtch.batch != null, swtch.batch, Boolean, "batch"],
      [swtch.datapath != null, swtch.datapath, String, "datapath"],
      [swtch.dpctlPort != null, swtch.dpctlPort, Number, "listenPort"],
      [swtch.dpid != null, swtch.dpid, String, "dpid"],
      [swtch.dpopts != null, swtch.dpopts, String, "dpopts"],
      [swtch.failMode != null, swtch.failMode, String, "failMode"],
      [swtch.inNamespace != null, swtch.inNamespace, Boolean, "inNamespace"],
      [swtch.inband != null, swtch.inband, Boolean, "inband"],
      [swtch.ip != null, swtch.ip, String, "ip"],
      [swtch.opts != null, swtch.opts, String, "opts"],
      [swtch.protocol != null, swtch.protocol, String, "protocols"],
      [swtch.reconnectms != null, swtch.reconnectms, Number, "reconnectms"],
      [swtch.stp != null, swtch.stp, Boolean, "stp"],
      [swtch.stpPriority != null, swtch.stpPriority, Number, "prio"],
      [
        swtch.switchType != null,
        `mininet.node.${swtch.switchType}`,
        null,
        "cls",
      ],
      [swtch.verbose != null, swtch.verbose, Boolean, "verbose"],
    ]);
    // const controllerHostnames = this._getNeighbors(swtch, ["controller"])
    //   .map((controller) => controller.hostname);
    this._code.nodes.push(
      `${swtch.hostname} = self.addSwitch(${args.join(", ")})`,
    );

    this._addNodeScripts(swtch.hostname, swtch.startScript, swtch.stopScript);
  }

  _portToNode(port) {
    return this._getNeighbors(port, ["host", "switch"])[0];
  }

  _getNeighbors(node, types) {
    const nodes = new Set();
    node.$associations
      .forEach((assoc) => {
        assoc.$nodes
          .forEach((node) => nodes.add(node));
      });

    return [...nodes].filter((n) => n !== node && types.indexOf(n.type) >= 0);
  }

  _addHostname(item) {
    const hostname = item.hostname;
    if (this._hostnames.has(hostname)) {
      throw new SyntaxError("Hostname collision.");
    } else {
      this._hostnames.add(hostname);
    }
  }

  _addDevname(port, devname) {
    if (this._devnames[devname]) {
      const error = new SyntaxError("Devname collision.");
      error.payload = {
        devname,
        ports: [this._devnames[devname], port],
      };
      throw error;
    } else {
      this._devnames[devname] = port;
    }
  }

  _addLinkedPort(port) {
    if (this._linked.has(port)) {
      const error = new SyntaxError("Multiple links per port.");
      error.payload = { port };
      throw error;
    } else {
      this._linked.add(port);
    }
  }

  _scriptToCmds(script, nodeVar) {
    return script.split("\n")
      .filter((line) => !/^(#|$)/.test(line))
      .map((line) => [
        `mininet.log.debug('${nodeVar || "[mininet]"}> ${line}\\n')`,
        nodeVar ? `${nodeVar}.cmdPrint('${line}')` : `cli.onecmd('${line}')`,
      ])
      .reduce((acc, val) => acc.concat(val), []);
  }

  _addNodeScripts(hostname, startScript, stopScript) {
    if (startScript) {
      this._code.nodeStartCmds.push(
        ...this._scriptToCmds(startScript, hostname),
      );
    }
    if (stopScript) {
      this._code.nodeStopCmds.push(
        ...this._scriptToCmds(stopScript, hostname),
      );
    }
  }

  _log(msg, severity, item) {
    this.log.push({ item, severity, msg });
  }
}
