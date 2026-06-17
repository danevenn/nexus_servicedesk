import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";
import { embed } from "../src/lib/embeddings";
import { notificationTitle } from "../src/lib/services/notifications";
import {
  derivePriority,
  slaTargets,
  REF_PREFIX,
  type ImpactUrgency,
} from "../src/lib/services/tickets-domain";
import type {
  CiType,
  CiStatus,
  Environment,
  Channel,
  TicketKind,
  TicketStatus,
  Role,
  ChangeType,
  RiskLevel,
  ApprovalState,
  ApprovalDecision,
  NotificationKind,
} from "../src/generated/prisma/enums";

// ─────────────────────────────────────────────────────────────────────────
//  Escenario "Acme Cloud": empresa SaaS con infraestructura propia en tres
//  datacenters. CMDB rica (~200 CIs con ficha técnica completa), grupos de
//  asignación ITIL, y una cola de tickets extensa, en su mayoría cerrados y
//  documentados (notas de trabajo + solución), al estilo de ServiceNow.
//
//  Generación DETERMINISTA (PRNG con semilla) → reproducible.
// ─────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260614);
const rand = (n: number) => Math.floor(rng() * n);
const pick = <T>(arr: readonly T[]): T => arr[rand(arr.length)];
const chance = (p: number) => rng() < p;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

async function reset() {
  await prisma.widget.deleteMany();
  await prisma.dashboard.deleteMany();
  // KnowledgeArticle apunta a User (FK) y a ConfigurationItem (N-N): se borra
  // antes que ambos para evitar violaciones de clave foránea.
  await prisma.knowledgeArticle.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.changeApproval.deleteMany();
  await prisma.ticketEvent.deleteMany();
  await prisma.sla.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.ciDependency.deleteMany();
  await prisma.configurationItem.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.serviceCatalogItem.deleteMany(); // FK → AssignmentGroup
  await prisma.assignmentGroup.deleteMany();
}

// ─── Grupos de asignación ITIL ───────────────────────────────────────────

const GROUPS: { name: string; description: string }[] = [
  { name: "Service Desk N1", description: "Primer nivel: recepción y triaje de incidencias y solicitudes." },
  { name: "Sistemas Linux", description: "Administración de servidores Red Hat Enterprise Linux." },
  { name: "Sistemas Windows", description: "Administración de servidores Windows Server." },
  { name: "Virtualización", description: "Plataforma VMware vSphere e hipervisores ESXi." },
  { name: "Redes y Comunicaciones", description: "Switching, routing y balanceadores." },
  { name: "Almacenamiento y Backup", description: "Cabinas de almacenamiento y copias de seguridad." },
  { name: "Base de Datos", description: "PostgreSQL, SQL Server, Oracle, Redis y MongoDB." },
  { name: "Seguridad", description: "Firewalls, accesos y cumplimiento." },
];

// ─── Usuarios ────────────────────────────────────────────────────────────

const USERS: { name: string; email: string; role: Role; group?: string }[] = [
  { name: "Ana Admin", email: "admin@nexo.dev", role: "ADMIN" },
  { name: "Manuel Manager", email: "manager@nexo.dev", role: "MANAGER", group: "Service Desk N1" },
  { name: "Águeda Linux", email: "agente@nexo.dev", role: "AGENT", group: "Sistemas Linux" },
  { name: "Aitor Soporte", email: "soporte@nexo.dev", role: "AGENT", group: "Service Desk N1" },
  { name: "Nuria Redes", email: "redes@nexo.dev", role: "AGENT", group: "Redes y Comunicaciones" },
  { name: "Diego Windows", email: "windows@nexo.dev", role: "AGENT", group: "Sistemas Windows" },
  { name: "Bea Virtual", email: "virtual@nexo.dev", role: "AGENT", group: "Virtualización" },
  { name: "Carlos Datos", email: "bbdd@nexo.dev", role: "AGENT", group: "Base de Datos" },
  { name: "Sara Storage", email: "storage@nexo.dev", role: "AGENT", group: "Almacenamiento y Backup" },
  { name: "Iván Seguridad", email: "seguridad@nexo.dev", role: "AGENT", group: "Seguridad" },
  { name: "Rita Cliente", email: "cliente@nexo.dev", role: "REQUESTER" },
  { name: "Raúl Usuario", email: "usuario@nexo.dev", role: "REQUESTER" },
  { name: "Invitado Demo", email: "demo@nexo.dev", role: "VIEWER" },
];
const DEV_PASSWORD = "Password123!";

async function seedGroups() {
  const ids: Record<string, string> = {};
  for (const g of GROUPS) {
    const created = await prisma.assignmentGroup.create({ data: g });
    ids[g.name] = created.id;
  }
  return ids;
}

async function seedUsers(groupIds: Record<string, string>) {
  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const res = await auth.api.signUpEmail({
      body: { email: u.email, password: DEV_PASSWORD, name: u.name },
    });
    await prisma.user.update({
      where: { id: res.user.id },
      data: {
        role: u.role,
        assignmentGroupId: u.group ? groupIds[u.group] : null,
      },
    });
    ids[u.email] = res.user.id;
  }
  return ids;
}

// ─── CMDB: topología + ficha técnica ─────────────────────────────────────

type CiSeed = {
  key: string;
  name: string;
  type: CiType;
  status: CiStatus;
  criticality: number;
  environment: Environment;
  datacenter: string;
  vendor: string;
  os: string | null;
  ipAddress: string | null;
  dependsOn: string[];
  // ficha técnica (rellenada por enrichCi)
  hostname?: string | null;
  fqdn?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  rackLocation?: string | null;
  osVersion?: string | null;
  patchLevel?: string | null;
  cpuModel?: string | null;
  cpuSockets?: number | null;
  cpuCores?: number | null;
  ramGb?: number | null;
  storageGb?: number | null;
  capacityTb?: number | null;
  hostedVms?: number | null;
};

const DCS = [
  { code: "fra1", name: "Frankfurt DC1", net: 10, env: "PROD" as Environment },
  { code: "fra2", name: "Frankfurt DC2", net: 20, env: "DR" as Environment },
  { code: "mad1", name: "Madrid DC1", net: 30, env: "STAGING" as Environment },
] as const;

function rollStatus(): CiStatus {
  const r = rng();
  if (r < 0.04) return "DOWN";
  if (r < 0.14) return "DEGRADED";
  if (r < 0.16) return "RETIRED";
  return "OPERATIONAL";
}

// Datos para la ficha técnica
const SERVER_HW = [
  "Dell PowerEdge R760",
  "HPE ProLiant DL380 Gen11",
  "Cisco UCS C240 M7",
  "Lenovo ThinkSystem SR650 V3",
];
const CPUS = [
  "Intel Xeon Gold 6438Y (32C)",
  "Intel Xeon Gold 6448Y (32C)",
  "Intel Xeon Platinum 8462Y+ (32C)",
  "AMD EPYC 9354 (32C)",
  "AMD EPYC 9454 (48C)",
];
const STORAGE_ARRAYS = [
  { vendor: "Pure Storage", model: "FlashArray //X70 R4", fw: "Purity//FA 6.5.1" },
  { vendor: "HPE", model: "3PAR StoreServ 8450", fw: "3PAR OS 3.3.1 MU5" },
  { vendor: "Dell EMC", model: "PowerStore 3200T", fw: "PowerStoreOS 3.6" },
  { vendor: "NetApp", model: "AFF A400", fw: "ONTAP 9.14.1" },
];

function rackOf(dcCode: string): string {
  const letter = String.fromCharCode(65 + rand(6));
  return `${dcCode.toUpperCase()} · Rack ${letter}${1 + rand(20)} · U${1 + rand(40)}`;
}
function serial(prefix: string): string {
  return `${prefix}${pad(rand(9999), 4)}${String.fromCharCode(65 + rand(26))}${String.fromCharCode(65 + rand(26))}`;
}

// Rellena la ficha técnica según el tipo de CI.
function enrichCi(ci: CiSeed): CiSeed {
  const dcCode = ci.datacenter.startsWith("Frankfurt DC1")
    ? "fra1"
    : ci.datacenter.startsWith("Frankfurt DC2")
      ? "fra2"
      : "mad1";

  if (ci.type === "NETWORK") {
    const n = ci.name;
    if (n.includes("router")) {
      ci.model = "Cisco Nexus 9336C-FX2";
      ci.osVersion = "NX-OS 10.3(4a)";
    } else if (n.includes("firewall")) {
      ci.model = "Cisco Secure Firewall 2140";
      ci.osVersion = "ASA 9.20(2)";
    } else if (n.includes("switch")) {
      ci.model = "Cisco Catalyst 9500-48Y4C";
      ci.osVersion = "IOS-XE 17.12.03";
    } else {
      ci.model = "F5 BIG-IP i5800";
      ci.osVersion = "TMOS 17.1.1.3";
    }
    ci.serialNumber = serial("FOC");
    ci.rackLocation = rackOf(dcCode);
  } else if (ci.type === "STORAGE") {
    const arr = pick(STORAGE_ARRAYS);
    ci.vendor = arr.vendor;
    ci.model = arr.model;
    ci.osVersion = arr.fw;
    ci.capacityTb = pick([50, 100, 150, 200, 300, 500]);
    ci.serialNumber = serial("SN");
    ci.rackLocation = rackOf(dcCode);
  } else if (ci.type === "HYPERVISOR") {
    ci.model = pick(SERVER_HW);
    ci.cpuModel = pick(CPUS);
    ci.cpuSockets = 2;
    ci.cpuCores = pick([48, 64, 96, 128]);
    ci.ramGb = pick([512, 768, 1024]);
    ci.storageGb = pick([1920, 3840, 7680]);
    ci.hostedVms = 12 + rand(28);
    ci.os = "VMware ESXi";
    ci.osVersion = pick(["8.0 Update 2 (build 22380479)", "7.0 Update 3 (build 21930508)"]);
    ci.serialNumber = serial("SVT");
    ci.rackLocation = rackOf(dcCode);
    ci.hostname = ci.name;
    ci.fqdn = `${ci.name}.acme.internal`;
  } else if (ci.type === "SERVER") {
    ci.model = "VMware Virtual Machine";
    ci.cpuModel = `vCPU · ${pick(CPUS)}`;
    ci.cpuCores = pick([2, 4, 8, 16]);
    ci.ramGb = pick([8, 16, 32, 64]);
    ci.storageGb = pick([50, 100, 200, 500]);
    const isRhel = ci.vendor === "Red Hat";
    ci.osVersion = isRhel
      ? pick(["RHEL 9.4 (Plow)", "RHEL 8.10 (Ootpa)"])
      : pick(["Windows Server 2022 21H2 (build 20348.2402)", "Windows Server 2019 1809 (build 17763.5458)"]);
    ci.patchLevel = isRhel
      ? pick(["kernel 5.14.0-427", "kernel 4.18.0-553"])
      : pick(["2024-05 CU", "2024-04 CU"]);
    ci.hostname = ci.name;
    ci.fqdn = `${ci.name}.acme.internal`;
    ci.serialNumber = `VMW-${serial("")}`;
  } else if (ci.type === "DATABASE") {
    ci.cpuCores = pick([8, 16, 32]);
    ci.ramGb = pick([32, 64, 128, 256]);
    ci.storageGb = pick([500, 1000, 2000, 4000]);
    ci.osVersion = ci.os ?? null;
    ci.hostname = ci.name;
    ci.fqdn = `${ci.name}.acme.internal`;
  } else {
    // SERVICE / APPLICATION: lógico, sin hardware.
    ci.fqdn =
      ci.type === "APPLICATION"
        ? `${ci.name.toLowerCase().replace(/[^a-z]+/g, "-")}.acme.io`
        : null;
  }
  return ci;
}

function buildCmdb(): CiSeed[] {
  const cis: CiSeed[] = [];
  const add = (ci: Omit<CiSeed, "status"> & { status?: CiStatus }) => {
    cis.push({ status: ci.status ?? rollStatus(), ...ci });
    return ci.key;
  };

  for (const dc of DCS) {
    const ip = (sub: number, host: number) => `${dc.net}.${dc.net}.${sub}.${host}`;
    const env = dc.env;

    const routers = Array.from({ length: 2 }, (_, i) =>
      add({ key: `${dc.code}-rtr-${pad(i + 1)}`, name: `${dc.code}-core-router-${pad(i + 1)}`, type: "NETWORK", criticality: 5, environment: env, datacenter: dc.name, vendor: "Cisco", os: "Cisco NX-OS", ipAddress: ip(0, i + 1), dependsOn: [] }),
    );
    const firewalls = Array.from({ length: 2 }, (_, i) =>
      add({ key: `${dc.code}-fw-${pad(i + 1)}`, name: `${dc.code}-firewall-${pad(i + 1)}`, type: "NETWORK", criticality: 5, environment: env, datacenter: dc.name, vendor: "Cisco", os: "Cisco ASA", ipAddress: ip(0, 10 + i), dependsOn: [pick(routers)] }),
    );
    const coreSwitches = Array.from({ length: 2 }, (_, i) =>
      add({ key: `${dc.code}-csw-${pad(i + 1)}`, name: `${dc.code}-core-switch-${pad(i + 1)}`, type: "NETWORK", criticality: 5, environment: env, datacenter: dc.name, vendor: "Cisco", os: "Cisco IOS-XE", ipAddress: ip(0, 20 + i), dependsOn: [firewalls[i % firewalls.length]] }),
    );
    const accessSwitches = Array.from({ length: 6 }, (_, i) =>
      add({ key: `${dc.code}-asw-${pad(i + 1)}`, name: `${dc.code}-access-switch-${pad(i + 1)}`, type: "NETWORK", criticality: 3, environment: env, datacenter: dc.name, vendor: "Cisco", os: "Cisco IOS-XE", ipAddress: ip(1, i + 1), dependsOn: [coreSwitches[i % coreSwitches.length]] }),
    );
    const loadBalancers = Array.from({ length: 2 }, (_, i) =>
      add({ key: `${dc.code}-lb-${pad(i + 1)}`, name: `${dc.code}-load-balancer-${pad(i + 1)}`, type: "NETWORK", criticality: 4, environment: env, datacenter: dc.name, vendor: "F5", os: "F5 TMOS", ipAddress: ip(0, 30 + i), dependsOn: [pick(coreSwitches)] }),
    );
    const storage = Array.from({ length: 3 }, (_, i) =>
      add({ key: `${dc.code}-stg-${pad(i + 1)}`, name: `${dc.code}-storage-array-${pad(i + 1)}`, type: "STORAGE", criticality: 5, environment: env, datacenter: dc.name, vendor: "Dell EMC", os: null, ipAddress: ip(2, i + 1), dependsOn: [pick(accessSwitches)] }),
    );
    const hypervisors = Array.from({ length: 8 }, (_, i) =>
      add({ key: `${dc.code}-esxi-${pad(i + 1)}`, name: `${dc.code}-esxi-${pad(i + 1)}`, type: "HYPERVISOR", criticality: 4, environment: env, datacenter: dc.name, vendor: pick(["Dell EMC", "HPE", "Cisco"]), os: "VMware ESXi", ipAddress: ip(3, i + 1), dependsOn: [pick(accessSwitches), pick(storage)] }),
    );

    const SERVER_ROLES = ["app", "web", "api", "sql", "db", "mq", "cache", "batch", "mon", "bastion"] as const;
    const serverCount = dc.code === "fra1" ? 40 : dc.code === "fra2" ? 34 : 26;
    for (let i = 0; i < serverCount; i++) {
      const isLinux = chance(0.62);
      const role = pick(SERVER_ROLES);
      const sEnv: Environment = dc.code === "mad1" ? (chance(0.5) ? "STAGING" : "DEV") : env;
      add({
        key: `${dc.code}-srv-${pad(i + 1, 3)}`,
        name: `${dc.code}-${isLinux ? "rhel" : "win"}-${role}-${pad(i + 1, 3)}`,
        type: "SERVER",
        criticality: 2 + rand(3),
        environment: sEnv,
        datacenter: dc.name,
        vendor: isLinux ? "Red Hat" : "Microsoft",
        os: isLinux ? "Red Hat Enterprise Linux" : "Windows Server",
        ipAddress: ip(10 + (i >> 5), (i % 254) + 1),
        dependsOn: [pick(hypervisors)],
      });
    }
  }

  const allServers = cis.filter((c) => c.type === "SERVER");
  const DB_DEFS = [
    { tag: "pg", vendor: "PostgreSQL", os: "PostgreSQL 16.2" },
    { tag: "mssql", vendor: "Microsoft", os: "SQL Server 2022 (16.0.4105)" },
    { tag: "ora", vendor: "Oracle", os: "Oracle Database 19c (19.22)" },
    { tag: "redis", vendor: "Redis", os: "Redis 7.2.4" },
    { tag: "mongo", vendor: "MongoDB", os: "MongoDB 7.0.5" },
  ] as const;
  for (let i = 0; i < 16; i++) {
    const def = pick(DB_DEFS);
    const host = pick(allServers);
    cis.push({
      key: `db-${def.tag}-${pad(i + 1)}`,
      name: `${def.tag}-${host.datacenter.startsWith("Frankfurt") ? "fra" : "mad"}-${pad(i + 1)}`,
      type: "DATABASE",
      status: rollStatus(),
      criticality: 3 + rand(3),
      environment: host.environment,
      datacenter: host.datacenter,
      vendor: def.vendor,
      os: def.os,
      ipAddress: host.ipAddress,
      dependsOn: [host.key],
    });
  }

  const allDbs = cis.filter((c) => c.type === "DATABASE");
  const prodLbs = cis.filter((c) => c.type === "NETWORK" && c.name.includes("load-balancer"));
  const SERVICES = ["Auth Service", "Billing Service", "Notifications Service", "Payments Gateway", "Search Service", "Reporting Service", "Identity Provider", "API Gateway", "Email Relay", "Audit Log Service"];
  const APPS = ["Web App", "Customer Dashboard", "Admin Console", "Mobile Backend", "Partner Portal", "Status Page"];
  const svcKeys: string[] = [];
  SERVICES.forEach((name, i) => {
    const deps = [pick(allDbs).key, pick(allServers).key, ...(chance(0.6) ? [pick(prodLbs).key] : [])];
    const key = `svc-${pad(i + 1)}`;
    svcKeys.push(key);
    cis.push({ key, name, type: "SERVICE", status: rollStatus(), criticality: 4 + rand(2), environment: "PROD", datacenter: "Frankfurt DC1", vendor: "Acme Cloud", os: null, ipAddress: null, dependsOn: [...new Set(deps)] });
  });
  APPS.forEach((name, i) => {
    const deps = [pick(svcKeys), pick(svcKeys), ...(chance(0.7) ? [pick(prodLbs).key] : [])];
    cis.push({ key: `app-${pad(i + 1)}`, name, type: "APPLICATION", status: rollStatus(), criticality: 3 + rand(2), environment: "PROD", datacenter: "Frankfurt DC1", vendor: "Acme Cloud", os: null, ipAddress: null, dependsOn: [...new Set(deps)] });
  });

  return cis.map(enrichCi);
}

async function seedCmdb() {
  const seeds = buildCmdb();
  const ids: Record<string, string> = {};
  for (const ci of seeds) {
    const created = await prisma.configurationItem.create({
      data: {
        name: ci.name,
        type: ci.type,
        status: ci.status,
        criticality: ci.criticality,
        environment: ci.environment,
        datacenter: ci.datacenter,
        vendor: ci.vendor,
        os: ci.os,
        ipAddress: ci.ipAddress,
        hostname: ci.hostname ?? null,
        fqdn: ci.fqdn ?? null,
        model: ci.model ?? null,
        serialNumber: ci.serialNumber ?? null,
        rackLocation: ci.rackLocation ?? null,
        osVersion: ci.osVersion ?? null,
        patchLevel: ci.patchLevel ?? null,
        cpuModel: ci.cpuModel ?? null,
        cpuSockets: ci.cpuSockets ?? null,
        cpuCores: ci.cpuCores ?? null,
        ramGb: ci.ramGb ?? null,
        storageGb: ci.storageGb ?? null,
        capacityTb: ci.capacityTb ?? null,
        hostedVms: ci.hostedVms ?? null,
      },
    });
    ids[ci.key] = created.id;
  }
  const edges = new Set<string>();
  const data: { sourceId: string; targetId: string }[] = [];
  for (const ci of seeds) {
    for (const dep of ci.dependsOn) {
      if (!ids[dep] || dep === ci.key) continue;
      const sig = `${ci.key}->${dep}`;
      if (edges.has(sig)) continue;
      edges.add(sig);
      data.push({ sourceId: ids[ci.key], targetId: ids[dep] });
    }
  }
  await prisma.ciDependency.createMany({ data });
  return { ids, seeds, edges: data.length };
}

// ─── Escenarios de ticket por tipo de CI (texto realista + solución) ──────

type Scenario = {
  group: string;
  category: string;
  subcategory: string;
  kinds: TicketKind[];
  titles: string[];
  notes: string[];
  resolutions: { code: string; text: string }[];
};

function scenarioFor(ci: CiSeed): Scenario {
  if (ci.type === "NETWORK" && ci.name.includes("firewall")) {
    return {
      group: "Seguridad", category: "Seguridad", subcategory: "Firewall",
      kinds: ["INCIDENT", "CHANGE", "REQUEST"],
      titles: ["Regla de firewall bloquea tráfico legítimo", "Solicitud de apertura de puerto", "Revisión de reglas obsoletas"],
      notes: ["Capturado tráfico con packet-tracer; se confirma deny por ACL.", "Validado el flujo con el solicitante y el equipo de aplicación.", "Aplicado cambio en ventana de mantenimiento con rollback preparado."],
      resolutions: [{ code: "Resuelto", text: "Ajustada la ACL para permitir el flujo legítimo y documentada la excepción. Verificada conectividad extremo a extremo." }, { code: "Implementado", text: "Apertura de puerto aplicada y validada; cambio registrado en el repositorio de configuración." }],
    };
  }
  if (ci.type === "NETWORK") {
    return {
      group: "Redes y Comunicaciones", category: "Red", subcategory: "Conectividad",
      kinds: ["INCIDENT", "CHANGE"],
      titles: ["Pérdida de conectividad intermitente", "Alta latencia y pérdida de paquetes", "Actualización de firmware planificada", "Caída de enlace redundante"],
      notes: ["Detectados errores CRC en la interfaz; sospecha de óptica degradada.", "Failover automático al enlace redundante sin impacto al usuario.", "Coordinada ventana con el NOC; tráfico drenado antes del cambio."],
      resolutions: [{ code: "Resuelto", text: "Sustituido el transceptor SFP+ defectuoso y restablecido el enlace principal. Monitorizado 24h sin reincidencia." }, { code: "Implementado", text: "Firmware actualizado a la versión recomendada por el fabricante; verificada estabilidad del routing." }],
    };
  }
  if (ci.type === "STORAGE") {
    return {
      group: "Almacenamiento y Backup", category: "Almacenamiento", subcategory: "Rendimiento",
      kinds: ["INCIDENT", "CHANGE", "REQUEST"],
      titles: ["Latencia de I/O elevada", "Volumen cercano al 95% de capacidad", "Ampliación de LUN solicitada", "Fallo de disco en grupo RAID"],
      notes: ["Identificado hotspot en un volumen; cabina reportando colas de I/O altas.", "Disco marcado como failed; reconstrucción del grupo en curso.", "Rebalanceadas las cargas entre controladoras."],
      resolutions: [{ code: "Resuelto", text: "Rebalanceados los volúmenes entre controladoras y sustituido el disco degradado. Latencia de I/O de vuelta a valores normales (<2 ms)." }, { code: "Implementado", text: "Ampliada la LUN y presentada al host; sistema de ficheros extendido en caliente sin downtime." }],
    };
  }
  if (ci.type === "HYPERVISOR") {
    return {
      group: "Virtualización", category: "Virtualización", subcategory: "Recursos",
      kinds: ["INCIDENT", "CHANGE"],
      titles: ["Alta contención de CPU en el host", "Fallo de path al almacenamiento", "Mantenimiento y actualización de ESXi", "Host aislado del clúster"],
      notes: ["DRS muestra desequilibrio; varias VMs compitiendo por CPU ready.", "Detectado APD parcial hacia una cabina; multipath degradado.", "Host puesto en modo mantenimiento; VMs evacuadas con vMotion."],
      resolutions: [{ code: "Resuelto", text: "Rebalanceadas las VMs con vMotion y ajustadas las reservas de CPU. Restaurado el multipath tras corregir el zoning. Clúster estable." }, { code: "Implementado", text: "ESXi actualizado vía vLCM, host reincorporado al clúster y validado HA/DRS." }],
    };
  }
  if (ci.type === "SERVER" && ci.vendor === "Microsoft") {
    return {
      group: "Sistemas Windows", category: "Sistemas", subcategory: "Windows",
      kinds: ["INCIDENT", "CHANGE", "REQUEST"],
      titles: ["Servicio de Windows detenido", "Uso de memoria anómalo", "Aplicación de parches mensuales", "Espacio en disco C: agotado"],
      notes: ["Servicio en estado Stopped con dependencia fallida en el arranque.", "Identificada fuga de memoria en un proceso de aplicación.", "Aplicado Patch Tuesday en ventana; reinicio controlado."],
      resolutions: [{ code: "Resuelto", text: "Corregida la dependencia del servicio y reiniciado; configurado arranque automático con recuperación. Servicio operativo." }, { code: "Implementado", text: "Parches de seguridad aplicados y servidor reiniciado; validados los servicios de negocio tras el cambio." }],
    };
  }
  if (ci.type === "SERVER") {
    return {
      group: "Sistemas Linux", category: "Sistemas", subcategory: "Linux",
      kinds: ["INCIDENT", "CHANGE", "REQUEST"],
      titles: ["Uso de CPU al 100%", "Partición raíz llena", "Aplicación de erratas de seguridad", "Proceso zombie consumiendo recursos"],
      notes: ["Identificado proceso runaway con top/pidstat consumiendo toda la CPU.", "Logs sin rotar llenando /var; journald creciendo sin límite.", "Aplicadas erratas con dnf y reinicio de servicios afectados."],
      resolutions: [{ code: "Resuelto", text: "Acotado el proceso con un límite cgroup y aplicada la errata correspondiente. Rotados los logs y ampliado el LV de /var. Carga normalizada." }, { code: "Implementado", text: "Erratas de seguridad aplicadas vía dnf; kernel actualizado y servidor reiniciado en ventana." }],
    };
  }
  if (ci.type === "DATABASE") {
    return {
      group: "Base de Datos", category: "Base de Datos", subcategory: "Rendimiento",
      kinds: ["INCIDENT", "PROBLEM", "CHANGE"],
      titles: ["Saturación del pool de conexiones", "Consultas lentas degradan el servicio", "Bloqueos y deadlocks recurrentes", "Backup nocturno fallido"],
      notes: ["pg_stat_activity muestra conexiones agotadas y esperas en lock.", "Plan de ejecución hace seq scan sobre tabla grande sin índice.", "Job de backup falló por espacio en el repositorio."],
      resolutions: [{ code: "Resuelto", text: "Añadido pgbouncer y ampliado max_connections; creado índice sobre la columna filtrada y reescrita la consulta. Tiempos de respuesta < 200 ms." }, { code: "Solución temporal", text: "Reiniciado el pool y matadas las sesiones bloqueantes; pendiente análisis de causa raíz en problema asociado." }],
    };
  }
  // SERVICE / APPLICATION
  return {
    group: "Service Desk N1", category: "Software", subcategory: "Aplicación",
    kinds: ["INCIDENT", "REQUEST", "PROBLEM"],
    titles: ["Errores 5xx intermitentes", "Tiempos de carga elevados", "Solicitud de alta de acceso", "Funcionalidad no disponible"],
    notes: ["Pico de errores 5xx correlacionado con un despliegue reciente.", "Trazas APM apuntan a una dependencia lenta aguas abajo.", "Escalado al equipo de aplicación con los logs adjuntos."],
    resolutions: [{ code: "Resuelto", text: "Realizado rollback del despliegue y aplicado hotfix; añadida alerta para detección temprana. Servicio restablecido." }, { code: "Implementado", text: "Acceso aprovisionado según el rol solicitado y verificado por el usuario." }],
  };
}

const CHANNELS: Channel[] = ["PORTAL", "EMAIL", "PHONE", "CHAT", "MONITORING"];
const STATUSES: TicketStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"];
const REQUESTERS = ["cliente@nexo.dev", "usuario@nexo.dev"];
const CLOSED = new Set<TicketStatus>(["RESOLVED", "CLOSED"]);
const HOUR = 3600000;
const DAY = 86400000;

async function seedTickets(
  userIds: Record<string, string>,
  groupIds: Record<string, string>,
  groupMembers: Record<string, string[]>,
  ciIds: Record<string, string>,
  seeds: CiSeed[],
) {
  // CIs candidatos ponderados por criticidad.
  const pool: CiSeed[] = [];
  for (const ci of seeds) {
    const weight = ci.type === "SERVER" ? 1 : ci.criticality;
    for (let i = 0; i < weight; i++) pool.push(ci);
  }

  const counters: Record<string, number> = { INCIDENT: 0, REQUEST: 0, PROBLEM: 0, CHANGE: 0 };
  const now = Date.now();
  const TOTAL = 180;

  for (let i = 0; i < TOTAL; i++) {
    const ci = pick(pool);
    const sc = scenarioFor(ci);
    const kind = pick(sc.kinds);
    const titleBase = pick(sc.titles);

    const impact = (1 + rand(3)) as ImpactUrgency;
    const urgency = (1 + rand(3)) as ImpactUrgency;
    const priority = derivePriority(impact, urgency);
    counters[kind] += 1;
    const ref = `${REF_PREFIX[kind]}-${pad(counters[kind], 4)}`;

    // ~68% cerrados/resueltos (cola madura y documentada).
    const closed = chance(0.68);
    const status: TicketStatus = closed
      ? (chance(0.75) ? "CLOSED" : "RESOLVED")
      : pick(["NEW", "ASSIGNED", "IN_PROGRESS", "ON_HOLD"] as TicketStatus[]);

    // Antigüedad: cerrados hasta 120 días; abiertos hasta 21.
    const ageDays = closed ? rand(120) : rand(21);
    const createdAt = new Date(now - ageDays * DAY - rand(DAY));

    const groupName = sc.group;
    const members = groupMembers[groupName] ?? [];
    const assignee = status === "NEW" ? (chance(0.3) && members.length ? pick(members) : null) : members.length ? pick(members) : null;
    const requester = pick(REQUESTERS);
    const channel = kind === "INCIDENT" ? pick([...CHANNELS, "MONITORING", "MONITORING"] as Channel[]) : pick(["PORTAL", "EMAIL", "CHAT"] as Channel[]);

    const { respondBy, resolveBy } = slaTargets(priority, createdAt);
    const respondedAt = status === "NEW" ? null : new Date(createdAt.getTime() + (10 + rand(110)) * 60000);
    const handlingMs = (2 + rand(70)) * HOUR;
    const resolvedAt = CLOSED.has(status) ? new Date(createdAt.getTime() + handlingMs) : null;
    const breached = CLOSED.has(status)
      ? resolvedAt!.getTime() > resolveBy.getTime()
      : resolveBy.getTime() < now;

    const res = CLOSED.has(status) ? pick(sc.resolutions) : null;
    const title = `${titleBase} · ${ci.name}`;

    const ticket = await prisma.ticket.create({
      data: {
        ref,
        kind,
        title,
        description: `${titleBase} en ${ci.name} (${ci.datacenter}). Reportado vía ${channel.toLowerCase()}. Impacto percibido sobre el servicio asociado; se requiere diagnóstico y resolución según SLA.`,
        status,
        impact,
        urgency,
        priority,
        channel,
        category: sc.category,
        subcategory: sc.subcategory,
        ciId: ciIds[ci.key] ?? null,
        requesterId: userIds[requester],
        assigneeId: assignee ? userIds[assignee] : null,
        assignmentGroupId: groupIds[groupName] ?? null,
        resolutionCode: res?.code ?? null,
        resolutionNotes: res?.text ?? null,
        createdAt,
        resolvedAt,
        sla: { create: { respondBy, resolveBy, respondedAt, breached } },
      },
    });

    // Eventos de auditoría (timeline) coherentes con el ciclo de vida.
    const events: {
      actorId: string;
      action: string;
      payload: object;
      createdAt: Date;
    }[] = [
      { actorId: userIds[requester], action: "created", payload: { ref, priority }, createdAt },
    ];
    if (assignee) {
      events.push({ actorId: userIds[assignee], action: "assigned", payload: { assigneeId: userIds[assignee], group: groupName }, createdAt: respondedAt ?? new Date(createdAt.getTime() + 20 * 60000) });
      // 1-3 notas de trabajo
      const n = 1 + rand(3);
      for (let k = 0; k < n; k++) {
        const noteAt = new Date(createdAt.getTime() + (1 + k) * (handlingMs / (n + 1)));
        events.push({ actorId: userIds[assignee], action: "work_note", payload: { text: pick(sc.notes) }, createdAt: noteAt });
      }
    }
    if (res && assignee && resolvedAt) {
      events.push({ actorId: userIds[assignee], action: "resolved", payload: { code: res.code }, createdAt: resolvedAt });
      if (status === "CLOSED") {
        events.push({ actorId: userIds[assignee], action: "status_changed", payload: { from: "RESOLVED", to: "CLOSED" }, createdAt: new Date(resolvedAt.getTime() + 6 * HOUR) });
      }
    }

    await prisma.ticketEvent.createMany({
      data: events.map((e) => ({
        ticketId: ticket.id,
        actorKind: "USER" as const,
        actorId: e.actorId,
        action: e.action,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
    });
  }
}

// ─── Ciclo ITIL: problemas (causa raíz) + cambios (CAB) ──────────────────
// Datos explícitos (no aleatorios) para que la demo tenga casos limpios:
// problemas que agrupan incidencias reales, y cambios con aprobaciones en los
// tres estados (pendiente, aprobado, rechazado).
async function seedItilCycle(userIds: Record<string, string>) {
  const agent = userIds["agente@nexo.dev"];
  const manager = userIds["manager@nexo.dev"];
  const admin = userIds["admin@nexo.dev"];
  const now = Date.now();

  // ── Problemas: agrupan incidencias existentes por causa raíz común ──
  const incidents = await prisma.ticket.findMany({
    where: { kind: "INCIDENT", problemId: null },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 7,
  });

  let prbN = await prisma.ticket.count({ where: { kind: "PROBLEM" } });
  const problemDefs = [
    {
      title: "Saturación recurrente del pool de conexiones de la BD de facturación",
      description:
        "Varias incidencias apuntan a la misma raíz: el pool de conexiones de la aplicación de facturación se agota de forma periódica, degradando el servicio. Se investiga la causa raíz y se propondrá un cambio correctivo.",
      rootCause:
        "Fuga de conexiones en la capa de acceso a datos: las conexiones no se devuelven al pool tras un timeout de consulta.",
      workaround:
        "Reciclado programado del pool cada 6 h y aumento temporal de max_connections mientras se prepara el arreglo definitivo.",
      incidentIds: incidents.slice(0, 4).map((i) => i.id),
    },
    {
      title: "Microcortes intermitentes de red en Frankfurt DC2",
      description:
        "Pérdidas de conectividad breves y repetidas en el datacenter de contingencia, con impacto en la replicación. Problema abierto para localizar y eliminar la causa raíz.",
      rootCause:
        "Transceptor degradado en un enlace troncal entre switches de core que provoca reinicios de enlace.",
      workaround:
        "Tráfico reenrutado por el enlace secundario mientras se sustituye el transceptor.",
      incidentIds: incidents.slice(4, 7).map((i) => i.id),
    },
  ];

  for (const p of problemDefs) {
    prbN++;
    const ref = `${REF_PREFIX.PROBLEM}-${pad(prbN, 4)}`;
    const priority = derivePriority(3, 2);
    const createdAt = new Date(now - (10 + rand(20)) * DAY);
    const { respondBy, resolveBy } = slaTargets(priority, createdAt);
    const problem = await prisma.ticket.create({
      data: {
        ref,
        kind: "PROBLEM",
        title: p.title,
        description: p.description,
        status: "IN_PROGRESS",
        impact: 3,
        urgency: 2,
        priority,
        channel: "MONITORING",
        category: "Gestión de problemas",
        requesterId: agent,
        assigneeId: agent,
        rootCause: p.rootCause,
        workaround: p.workaround,
        createdAt,
        sla: { create: { respondBy, resolveBy } },
        events: {
          create: {
            actorKind: "USER",
            actorId: agent,
            action: "created",
            payload: { ref, priority },
            createdAt,
          },
        },
      },
    });
    if (p.incidentIds.length > 0) {
      await prisma.ticket.updateMany({
        where: { id: { in: p.incidentIds } },
        data: { problemId: problem.id },
      });
      await prisma.ticketEvent.create({
        data: {
          ticketId: problem.id,
          actorKind: "USER",
          actorId: agent,
          action: "incidents_linked",
          payload: { count: p.incidentIds.length },
          createdAt: new Date(createdAt.getTime() + HOUR),
        },
      });
    }
  }

  // ── Cambios con flujo de aprobación del CAB (estados variados) ──
  let chgN = await prisma.ticket.count({ where: { kind: "CHANGE" } });
  const changeDefs: {
    title: string;
    changeType: ChangeType;
    risk: RiskLevel;
    status: TicketStatus;
    approvalState: ApprovalState;
    votes: { approverId: string; decision: ApprovalDecision; comment?: string }[];
  }[] = [
    {
      title: "Actualización de firmware de las cabinas de almacenamiento",
      changeType: "NORMAL",
      risk: "MEDIUM",
      status: "ASSIGNED",
      approvalState: "PENDING",
      votes: [
        { approverId: manager, decision: "PENDING" },
        { approverId: admin, decision: "PENDING" },
      ],
    },
    {
      title: "Migración del balanceador de carga a la nueva versión de TMOS",
      changeType: "NORMAL",
      risk: "HIGH",
      status: "IN_PROGRESS",
      approvalState: "APPROVED",
      votes: [
        { approverId: manager, decision: "APPROVED" },
        { approverId: admin, decision: "APPROVED" },
      ],
    },
    {
      title: "Despliegue urgente de parche de seguridad en servidores Windows",
      changeType: "EMERGENCY",
      risk: "HIGH",
      status: "ON_HOLD",
      approvalState: "REJECTED",
      votes: [
        { approverId: manager, decision: "APPROVED" },
        {
          approverId: admin,
          decision: "REJECTED",
          comment:
            "El riesgo no está suficientemente mitigado y no hay plan de marcha atrás. Reprogramar con ventana de mantenimiento.",
        },
      ],
    },
  ];

  for (const c of changeDefs) {
    chgN++;
    const ref = `${REF_PREFIX.CHANGE}-${pad(chgN, 4)}`;
    const priority = derivePriority(2, 2);
    const createdAt = new Date(now - (3 + rand(10)) * DAY);
    const { respondBy, resolveBy } = slaTargets(priority, createdAt);
    const plannedStart = new Date(now + (2 + rand(5)) * DAY);
    const plannedEnd = new Date(plannedStart.getTime() + 3 * HOUR);
    await prisma.ticket.create({
      data: {
        ref,
        kind: "CHANGE",
        title: c.title,
        description:
          "Cambio planificado sobre infraestructura de producción. Requiere la aprobación del CAB antes de su implementación.",
        status: c.status,
        impact: 2,
        urgency: 2,
        priority,
        channel: "PORTAL",
        category: "Gestión de cambios",
        requesterId: agent,
        assigneeId: agent,
        changeType: c.changeType,
        risk: c.risk,
        plannedStart,
        plannedEnd,
        approvalState: c.approvalState,
        createdAt,
        sla: { create: { respondBy, resolveBy } },
        approvals: {
          create: c.votes.map((v) => ({
            approverId: v.approverId,
            decision: v.decision,
            comment: v.comment ?? null,
            decidedAt:
              v.decision === "PENDING"
                ? null
                : new Date(createdAt.getTime() + DAY),
          })),
        },
        events: {
          create: [
            {
              actorKind: "USER",
              actorId: agent,
              action: "created",
              payload: { ref, priority },
              createdAt,
            },
            {
              actorKind: "USER",
              actorId: agent,
              action: "approval_requested",
              payload: { approverIds: c.votes.map((v) => v.approverId) },
              createdAt: new Date(createdAt.getTime() + HOUR),
            },
          ],
        },
      },
    });
  }

  return { problems: problemDefs.length, changes: changeDefs.length };
}

// ─── Catálogo de servicios (portal de autoservicio) ──────────────────────
type CatalogSeed = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  icon: string;
  group?: string; // nombre de AssignmentGroup al que enruta el REQUEST
  impactDefault?: number;
  urgencyDefault?: number;
  fields: {
    key: string;
    label: string;
    type: "text" | "textarea" | "select" | "number" | "date";
    required?: boolean;
    options?: string[];
    placeholder?: string;
    help?: string;
  }[];
};

const CATALOG: CatalogSeed[] = [
  {
    slug: "alta-de-usuario",
    name: "Alta de usuario",
    shortDescription: "Crea una cuenta y los accesos básicos para un nuevo empleado.",
    description:
      "Solicita el alta de un nuevo usuario en el directorio corporativo con sus accesos básicos (correo, intranet y carpetas de su departamento).",
    category: "Accesos",
    icon: "UserPlus",
    group: "Service Desk N1",
    fields: [
      { key: "nombre", label: "Nombre completo del empleado", type: "text", required: true, placeholder: "Nombre y apellidos" },
      { key: "departamento", label: "Departamento", type: "select", required: true, options: ["Operaciones", "Desarrollo", "Comercial", "Finanzas", "RR. HH.", "Dirección"] },
      { key: "fechaAlta", label: "Fecha de incorporación", type: "date", required: true },
      { key: "perfil", label: "Perfil o rol", type: "text", placeholder: "p. ej. Técnico de soporte", help: "Determina las pertenencias a grupos y aplicaciones." },
    ],
  },
  {
    slug: "acceso-vpn",
    name: "Acceso VPN remoto",
    shortDescription: "Habilita la conexión a la red corporativa desde el exterior.",
    description: "Solicita acceso a la VPN corporativa para teletrabajo o conexión desde fuera de la oficina.",
    category: "Accesos",
    icon: "ShieldCheck",
    group: "Seguridad",
    urgencyDefault: 3,
    fields: [
      { key: "usuario", label: "Usuario corporativo", type: "text", required: true },
      { key: "motivo", label: "Motivo del acceso", type: "select", required: true, options: ["Teletrabajo habitual", "Viaje / desplazamiento", "Acceso puntual"] },
      { key: "equipo", label: "Equipo desde el que conectará", type: "text", placeholder: "Hostname o nº de inventario" },
    ],
  },
  {
    slug: "acceso-base-de-datos",
    name: "Acceso a base de datos",
    shortDescription: "Permisos de lectura o escritura sobre una base de datos.",
    description: "Solicita acceso a una base de datos corporativa indicando el nivel requerido y la justificación.",
    category: "Accesos",
    icon: "Database",
    group: "Base de Datos",
    fields: [
      { key: "baseDatos", label: "Base de datos", type: "text", required: true, placeholder: "p. ej. facturacion-prod" },
      { key: "nivel", label: "Nivel de acceso", type: "select", required: true, options: ["Solo lectura", "Lectura y escritura", "Administración"] },
      { key: "justificacion", label: "Justificación", type: "textarea", required: true, help: "Necesaria para la aprobación del responsable de datos." },
    ],
  },
  {
    slug: "equipo-portatil",
    name: "Solicitud de portátil",
    shortDescription: "Pide un equipo portátil nuevo o de sustitución.",
    description: "Solicita la entrega de un equipo portátil corporativo, nuevo o en sustitución de uno averiado.",
    category: "Hardware",
    icon: "Laptop",
    group: "Service Desk N1",
    fields: [
      { key: "tipo", label: "Tipo de equipo", type: "select", required: true, options: ["Portátil estándar", "Portátil de altas prestaciones", "Equipo de sobremesa"] },
      { key: "justificacion", label: "Justificación", type: "textarea", required: true },
      { key: "fecha", label: "Fecha necesaria", type: "date" },
    ],
  },
  {
    slug: "alta-telefono-movil",
    name: "Alta de teléfono móvil",
    shortDescription: "Línea y/o terminal móvil corporativo.",
    description: "Solicita una línea móvil corporativa y, opcionalmente, un terminal.",
    category: "Hardware",
    icon: "Smartphone",
    group: "Service Desk N1",
    fields: [
      { key: "lineaNueva", label: "¿Línea nueva?", type: "select", required: true, options: ["Sí, línea y terminal", "Solo terminal", "Solo línea"] },
      { key: "modelo", label: "Modelo deseado", type: "text", placeholder: "Si no se indica, se asigna el estándar" },
    ],
  },
  {
    slug: "instalacion-software",
    name: "Instalación de software",
    shortDescription: "Instala una aplicación autorizada en tu equipo.",
    description: "Solicita la instalación de una aplicación del catálogo autorizado en un equipo corporativo.",
    category: "Software",
    icon: "Package",
    group: "Sistemas Windows",
    fields: [
      { key: "aplicacion", label: "Aplicación", type: "text", required: true },
      { key: "equipo", label: "Equipo (hostname)", type: "text", required: true },
      { key: "licencia", label: "¿Hay licencia disponible?", type: "select", options: ["Sí", "No", "No lo sé"] },
    ],
  },
  {
    slug: "buzon-compartido",
    name: "Buzón de correo compartido",
    shortDescription: "Crea un buzón de correo compartido por un equipo.",
    description: "Solicita la creación de un buzón de correo compartido (p. ej. soporte@, ventas@) y sus miembros.",
    category: "Comunicaciones",
    icon: "Mail",
    group: "Service Desk N1",
    fields: [
      { key: "nombreBuzon", label: "Nombre del buzón", type: "text", required: true, placeholder: "p. ej. soporte" },
      { key: "miembros", label: "Miembros (uno por línea)", type: "textarea", required: true },
      { key: "justificacion", label: "Justificación", type: "textarea" },
    ],
  },
];

async function seedCatalog(groupIds: Record<string, string>) {
  let position = 0;
  for (const c of CATALOG) {
    position += 1;
    await prisma.serviceCatalogItem.create({
      data: {
        slug: c.slug,
        name: c.name,
        shortDescription: c.shortDescription,
        description: c.description,
        category: c.category,
        icon: c.icon,
        position,
        impactDefault: c.impactDefault ?? 2,
        urgencyDefault: c.urgencyDefault ?? 2,
        fields: c.fields,
        assignmentGroupId: c.group ? (groupIds[c.group] ?? null) : null,
      },
    });
  }
  return CATALOG.length;
}

// ─── Notificaciones de demo ──────────────────────────────────────────────
// Las notificaciones reales las emite la capa de servicios; aquí sembramos
// unas pocas para que la campana tenga contenido al entrar como técnico.
async function seedNotifications(userIds: Record<string, string>) {
  const agent = userIds["agente@nexo.dev"];
  const manager = userIds["manager@nexo.dev"];
  const tickets = await prisma.ticket.findMany({
    select: { id: true, ref: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  if (tickets.length === 0) return 0;
  const now = Date.now();
  const defs: { recipientId: string; kind: NotificationKind; t: number; read: boolean }[] = [
    { recipientId: agent, kind: "ASSIGNED", t: 0, read: false },
    { recipientId: agent, kind: "WORK_NOTE", t: 1, read: false },
    { recipientId: manager, kind: "APPROVAL_REQUESTED", t: 2, read: false },
    { recipientId: agent, kind: "STATUS_CHANGED", t: 3, read: true },
    { recipientId: agent, kind: "RESOLVED", t: 4, read: true },
  ];
  for (const d of defs) {
    const tk = tickets[d.t % tickets.length];
    const createdAt = new Date(now - d.t * HOUR - rand(HOUR));
    await prisma.notification.create({
      data: {
        recipientId: d.recipientId,
        kind: d.kind,
        ticketId: tk.id,
        ticketRef: tk.ref,
        title: notificationTitle(d.kind, tk.ref),
        actorKind: "USER",
        readAt: d.read ? new Date(createdAt.getTime() + HOUR) : null,
        createdAt,
      },
    });
  }
  return defs.length;
}

// ─── Base de conocimiento (artículos ITIL) ───────────────────────────────

type KbSeed = {
  slug: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  // Patrón de nombre de CI con el que relacionar el artículo (contains).
  relateTo?: string;
};

const KB_ARTICLES: KbSeed[] = [
  {
    slug: "restablecer-contrasena-vpn",
    title: "Cómo restablecer la contraseña de la VPN corporativa",
    summary:
      "Procedimiento de autoservicio para que un usuario recupere el acceso a la VPN sin abrir incidencia.",
    category: "Procedimientos",
    body: [
      "## Requisitos",
      "- Tener el segundo factor (MFA) configurado en la app del móvil.",
      "- Estar dentro de la red corporativa o con conectividad a Internet.",
      "",
      "## Pasos",
      "1. Accede al portal de identidad en https://idp.acme.io y pulsa «¿Has olvidado tu contraseña?».",
      "2. Introduce tu correo corporativo y confirma el segundo factor.",
      "3. Define una contraseña nueva que cumpla la política (12+ caracteres, mayúsculas, números y símbolo).",
      "4. Espera 2-3 minutos a que el cambio se propague y vuelve a conectar el cliente VPN.",
      "",
      "## Si el problema persiste",
      "Abre una incidencia al grupo **Seguridad** indicando el mensaje de error exacto.",
    ].join("\n"),
    relateTo: "Identity Provider",
  },
  {
    slug: "errores-5xx-tras-despliegue",
    title: "Diagnóstico de errores 5xx intermitentes tras un despliegue",
    summary:
      "Guía rápida para correlacionar un pico de errores 5xx con un despliegue reciente y aplicar rollback.",
    category: "Procedimientos",
    body: [
      "## Síntoma",
      "Pico de respuestas HTTP 5xx en un servicio justo después de un despliegue.",
      "",
      "## Diagnóstico",
      "1. Revisa el panel APM y correlaciona el inicio de los errores con la hora del despliegue.",
      "2. Comprueba las trazas para localizar la dependencia aguas abajo que falla.",
      "3. Confirma si el error aparece solo en las instancias nuevas.",
      "",
      "## Resolución",
      "- Realiza **rollback** a la versión anterior estable.",
      "- Aplica el hotfix correspondiente y vuelve a desplegar de forma progresiva.",
      "- Añade una alerta sobre la tasa de 5xx para detección temprana.",
    ].join("\n"),
    relateTo: "API Gateway",
  },
  {
    slug: "particion-raiz-llena-linux",
    title: "Liberar espacio cuando la partición raíz se llena en RHEL",
    summary:
      "Pasos para diagnosticar y recuperar espacio en «/» en servidores Red Hat Enterprise Linux.",
    category: "Sistemas",
    body: [
      "## Diagnóstico",
      "```bash",
      "df -h /",
      "du -xh / | sort -rh | head -20",
      "journalctl --disk-usage",
      "```",
      "",
      "## Causas habituales",
      "- Logs sin rotar en `/var/log`.",
      "- `journald` creciendo sin límite.",
      "- Ficheros temporales o cores antiguos.",
      "",
      "## Resolución",
      "1. Rota y comprime los logs (`logrotate -f`).",
      "2. Limita `journald` con `SystemMaxUse` en `/etc/systemd/journald.conf`.",
      "3. Si el volumen es LVM, amplía el LV: `lvextend -r -L +5G /dev/vg/var`.",
    ].join("\n"),
    relateTo: "rhel",
  },
  {
    slug: "servicio-windows-detenido",
    title: "Reiniciar un servicio de Windows detenido con dependencia fallida",
    summary:
      "Cómo recuperar un servicio en estado Stopped y configurar su recuperación automática.",
    category: "Sistemas",
    body: [
      "## Diagnóstico",
      "1. Abre `services.msc` y localiza el servicio en estado **Detenido**.",
      "2. Revisa la pestaña **Dependencias** y el visor de eventos (System).",
      "",
      "## Resolución",
      "1. Arranca primero la dependencia fallida y luego el servicio.",
      "2. En **Propiedades → Recuperación**, configura «Reiniciar el servicio» en el primer y segundo fallo.",
      "3. Verifica que el tipo de inicio sea **Automático**.",
    ].join("\n"),
    relateTo: "win",
  },
  {
    slug: "saturacion-pool-conexiones-postgres",
    title: "Resolver la saturación del pool de conexiones en PostgreSQL",
    summary:
      "Síntomas, mitigación inmediata y solución definitiva ante el agotamiento de conexiones.",
    category: "Bases de datos",
    body: [
      "## Síntoma",
      "Las aplicaciones reportan «too many clients» y `pg_stat_activity` muestra conexiones agotadas.",
      "",
      "## Mitigación inmediata",
      "```sql",
      "SELECT count(*) FROM pg_stat_activity;",
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity",
      "  WHERE state = 'idle' AND state_change < now() - interval '10 min';",
      "```",
      "",
      "## Solución definitiva",
      "- Introduce **pgbouncer** en modo transaction pooling.",
      "- Ajusta `max_connections` acorde a la memoria del servidor.",
      "- Revisa fugas de conexiones en la aplicación (pools sin cerrar).",
    ].join("\n"),
    relateTo: "pg-",
  },
  {
    slug: "endurecimiento-reglas-firewall",
    title: "Buenas prácticas para revisar y endurecer reglas de firewall",
    summary:
      "Checklist para auditar reglas obsoletas y documentar excepciones en los firewalls de perímetro.",
    category: "Seguridad",
    body: [
      "## Checklist de revisión",
      "1. Identifica reglas sin tráfico (hit count = 0) en los últimos 90 días.",
      "2. Verifica que cada regla tenga descripción y propietario.",
      "3. Sustituye reglas «any-any» por orígenes y destinos concretos.",
      "4. Documenta cada excepción en el repositorio de configuración.",
      "",
      "## Cambios",
      "Aplica los cambios en ventana de mantenimiento con un plan de rollback preparado y valida la conectividad extremo a extremo.",
    ].join("\n"),
    relateTo: "firewall",
  },
  {
    slug: "contencion-cpu-esxi",
    title: "Mitigar la contención de CPU en un host ESXi",
    summary:
      "Cómo identificar y corregir el CPU ready elevado y el desequilibrio de un clúster vSphere.",
    category: "Procedimientos",
    body: [
      "## Síntoma",
      "Las VMs van lentas y vCenter muestra **CPU ready** alto en el host.",
      "",
      "## Diagnóstico",
      "- Revisa el panel de rendimiento del host y el equilibrio de DRS.",
      "- Localiza VMs sobredimensionadas (demasiados vCPU).",
      "",
      "## Resolución",
      "1. Rebalancea las VMs con **vMotion** entre hosts.",
      "2. Ajusta reservas y límites de CPU en las VMs críticas.",
      "3. Reduce los vCPU de las VMs sobredimensionadas.",
    ].join("\n"),
    relateTo: "esxi",
  },
  {
    slug: "politica-backup-3-2-1",
    title: "Política de copias de seguridad 3-2-1 (borrador)",
    summary:
      "Propuesta de estandarización de la política de backup corporativa. Pendiente de aprobación.",
    category: "Procedimientos",
    status: "DRAFT",
    body: [
      "> **Borrador** — pendiente de revisión por el comité de cambios.",
      "",
      "## Principio 3-2-1",
      "- **3** copias de los datos.",
      "- **2** soportes distintos.",
      "- **1** copia fuera de las instalaciones (offsite / inmutable).",
      "",
      "## Pendiente",
      "- Definir ventanas y retención por tipo de servicio.",
      "- Validar el coste del almacenamiento inmutable.",
    ].join("\n"),
  },
];

async function seedKnowledgeBase(authorId: string) {
  for (const a of KB_ARTICLES) {
    let relatedIds: { id: string }[] = [];
    if (a.relateTo) {
      const cis = await prisma.configurationItem.findMany({
        where: { name: { contains: a.relateTo, mode: "insensitive" } },
        select: { id: true },
        take: 4,
      });
      relatedIds = cis.map((c) => ({ id: c.id }));
    }
    // Embedding semántico (best-effort): si el modelo no está disponible, el
    // artículo se siembra igual, sin vector.
    let embedding: number[] = [];
    try {
      embedding = await embed(`${a.title}\n${a.summary}\n${a.body}`);
    } catch (e) {
      console.warn(`   (embedding omitido para ${a.slug}:`, (e as Error).message + ")");
    }
    await prisma.knowledgeArticle.create({
      data: {
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        body: a.body,
        category: a.category,
        status: a.status ?? "PUBLISHED",
        embedding,
        authorId,
        relatedCis: relatedIds.length ? { connect: relatedIds } : undefined,
      },
    });
  }
}

async function main() {
  console.log("→ Limpiando datos previos…");
  await reset();
  console.log("→ Creando grupos de asignación…");
  const groupIds = await seedGroups();
  console.log("→ Creando usuarios (vía better-auth)…");
  const userIds = await seedUsers(groupIds);
  // Miembros por grupo (para asignar tickets).
  const groupMembers: Record<string, string[]> = {};
  for (const u of USERS) {
    if (u.group && (u.role === "AGENT" || u.role === "MANAGER")) {
      (groupMembers[u.group] ??= []).push(u.email);
    }
  }
  console.log("→ Construyendo la CMDB (~200 CIs con ficha técnica)…");
  const { ids: ciIds, seeds, edges } = await seedCmdb();
  console.log(`   ${seeds.length} CIs · ${edges} dependencias`);
  console.log("→ Generando ~180 tickets documentados, SLAs y eventos…");
  await seedTickets(userIds, groupIds, groupMembers, ciIds, seeds);
  console.log("→ Tejiendo el ciclo ITIL: problemas (causa raíz) y cambios (CAB)…");
  await seedItilCycle(userIds);
  console.log("→ Montando el catálogo de servicios…");
  await seedCatalog(groupIds);
  console.log("→ Publicando artículos de la base de conocimiento (con embeddings; la 1ª vez descarga el modelo ~120 MB)…");
  await seedKnowledgeBase(userIds["agente@nexo.dev"]);
  console.log("→ Sembrando notificaciones de demo…");
  await seedNotifications(userIds);

  const [users, groups, cis, deps, tickets, closed, slas, events, articles, problems, changes, approvals] = await Promise.all([
    prisma.user.count(),
    prisma.assignmentGroup.count(),
    prisma.configurationItem.count(),
    prisma.ciDependency.count(),
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } }),
    prisma.sla.count(),
    prisma.ticketEvent.count(),
    prisma.knowledgeArticle.count(),
    prisma.ticket.count({ where: { kind: "PROBLEM" } }),
    prisma.ticket.count({ where: { kind: "CHANGE" } }),
    prisma.changeApproval.count(),
  ]);
  const embedded = await prisma.knowledgeArticle.count({
    where: { NOT: { embedding: { isEmpty: true } } },
  });
  const catalog = await prisma.serviceCatalogItem.count();
  const notifications = await prisma.notification.count();
  console.log("\n✓ Seed completado:");
  console.table({ usuarios: users, grupos: groups, CIs: cis, dependencias: deps, tickets, "tickets cerrados": closed, slas, eventos: events, "artículos KB": articles, "KB con embedding": embedded, "ítems catálogo": catalog, problemas: problems, cambios: changes, "votos CAB": approvals, notificaciones: notifications });
}

main()
  .catch((e) => {
    console.error("✗ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
