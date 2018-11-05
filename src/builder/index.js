import Code from './Code'
import Items from './Items'

export default class {
  constructor (data) {
    this.log = []
    this._data = data
    this._items = new Items(data.items)
    this._code = new Code()
  }
  build () {
    [
      { items: this._items.arr.controller, method: this._addController.bind(this) },
      { items: this._items.arr.host, method: this._addHost.bind(this) },
      { items: this._items.arr.link, method: this._addLink.bind(this) },
      { items: this._items.arr.port, method: this._addPort.bind(this) },
      { items: this._items.arr.switch, method: this._addSwitch.bind(this) }
    ].forEach(({ items, method }) => {
      items.forEach(item => {
        try {
          method(item)
        } catch (error) {
          console.error(error)
          this._log(
            item != null && item.type !== null && item.id !== null
              ? `Failed to add ${item.type}/${item.hostname} (${item.id}).`
              : `Malformed item (${this._items.arr.$all.find(v => v === item)}).`,
            'error',
            item
          )
        }
      })
    })
    if (this._data.script) {
      this._addScript(this._data.script)
    }

    return this._code.toString()
  }

  _addScript (script) {
    script.split('\n')
      .filter(line => !/^(#|$)/.test(line))
      .forEach(line => this._code.cmds.push(
        `debug('mininet> ${line}\\n')`,
        `cli.onecmd('${line}')`
      ))
  }

  _addController (controller) {
    const args = [
      `'${controller.hostname}'`,
      ...(controller.controllerType != null ? [`controller=mininet.node.${controller.controllerType}`] : []),
      ...(controller.ip != null ? [`ip='${controller.ip}'`] : []),
      ...(controller.port != null ? [`port=${controller.port}`] : [])
    ]
    this._code.nodes.push(`${controller.hostname} = net.addController(${args.join(', ')})`)
    this._code.startControllers.push(`${controller.hostname}.start()`)
  }
  _addHost (host) {
    const args = [
      `'${host.hostname}'`,
      'ip=None',
      ...(host.defaultRoute != null ? [`defaultRoute='via ${host.defaultRoute}'`] : [])
    ]
    this._code.nodes.push(`${host.hostname} = net.addHost(${args.join(', ')})`)
  }
  _addLink (link) {
    const fromPort = this._items.map.port[link.from]
    const toPort = this._items.map.port[link.to]

    const fromNode = this._portToNode(fromPort)
    const toNode = this._portToNode(toPort)

    const fromDev = `${fromNode.hostname}-${fromPort.hostname}`
    const toDev = `${toNode.hostname}-${toPort.hostname}`

    const args = [
      fromNode.hostname,
      toNode.hostname,
      `intfName1='${fromDev}'`,
      `intfName2='${toDev}'`,
      ...(link.bandwidth != null ? [`bw=${link.bandwidth}`] : []),
      ...(link.delay != null ? [`delay='${link.delay}'`] : []),
      ...(link.loss != null ? [`loss=${link.loss}`] : []),
      ...(link.maxQueueSize != null ? [`max_queue_size=${link.maxQueueSize}`] : []),
      ...(link.jitter != null ? [`jitter='${link.jitter}'`] : [])
    ]

    this._code.links.push(`net.addLink(${args.join(', ')})`)
  }
  _addPort (port) {
    const link = port.$links[0]
    const node = this._portToNode(port)
    if (!link || !node) {
      this._log(
        `Skipping ${port.type}/${port.hostname} (${port.id}): not connected to anything.`,
        'info',
        port
      )
      return
    }

    const hostname = node.hostname
    const dev = `${hostname}-${port.hostname}`

    ;(port.ips || []).forEach((ip, i) => {
      this._code.ports.push(
        ...(i === 0 ? [
          `${hostname}.intf('${dev}').ip = '${ip.split('/')[0]}'`,
          `${hostname}.intf('${dev}').prefixLen = ${ip.split('/')[1]}`
        ] : []),
        `${hostname}.cmd('ip a a ${ip} dev ${dev}')`
      )
    })
  }
  _addSwitch (swtch) {
    const args = [
      `'${swtch.hostname}'`,
      ...(swtch.batch != null ? [`batch=${swtch.batch ? 'True' : 'False'}`] : []),
      ...(swtch.datapath != null ? [`datapath='${swtch.datapath}'`] : []),
      ...(swtch.dpopts != null ? [`dpopts='${swtch.dpopts}'`] : []),
      ...(swtch.failMode != null ? [`failMode='${swtch.failMode}'`] : []),
      ...(swtch.inband != null ? [`inband=${swtch.inband ? 'True' : 'False'}`] : []),
      ...(swtch.protocol != null ? [`protocols='${swtch.protocol}'`] : []),
      ...(swtch.reconnectms != null ? [`reconnectms=${swtch.reconnectms}`] : []),
      ...(swtch.stp != null ? [`stp=${swtch.stp ? 'True' : 'False'}`] : []),
      ...(swtch.stpPriority != null ? [`prio=${swtch.stpPriority}`] : []),
      ...(swtch.switchType != null ? [`cls=mininet.node.${swtch.switchType}`] : [])
    ]
    const controllerHostnames = this._getNeighbors(swtch, ['controller'])
      .map(controller => controller.hostname)
    this._code.nodes.push(`${swtch.hostname} = net.addSwitch(${args.join(', ')})`)
    this._code.startSwitches.push(`${swtch.hostname}.start([${controllerHostnames.join(', ')}])`)
  }

  _portToNode (port) {
    return this._getNeighbors(port, ['host', 'switch'])[0]
  }
  _getNeighbors (node, types) {
    const nodes = new Set()
    node.$associations
      .forEach(assoc => {
        assoc.$nodes
          .forEach(node => nodes.add(node))
      })

    return [...nodes].filter(n => n !== node && types.indexOf(n.type) >= 0)
  }

  _log (msg, severity, item) {
    this._code.log.push(msg.replace(/^(.*)$/gm, '# $1'))
    this.log.push({ item, severity, msg })
  }
}