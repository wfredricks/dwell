#!/bin/bash
# Dwell SIG Query Utility
# Queries the live dwell-sig Neo4j instance.
#
# Usage:
#   sig-query.sh modules                    — list all modules
#   sig-query.sh brief <module>             — full module brief (human-readable)
#   sig-query.sh json <module>              — full module brief (JSON for subagents)
#   sig-query.sh consumes <module>          — event types consumed
#   sig-query.sh emits <module>             — event types emitted
#   sig-query.sh invariants <module>        — invariants to enforce
#   sig-query.sh files <module>             — files to create
#   sig-query.sh functions <module>         — functions to implement
#   sig-query.sh verify-contract <module>   — verification contract for right bookend
#   sig-query.sh status                     — graph node counts
#
# @adopt:dwell-sig-host      [resolved: localhost]
# @adopt:dwell-sig-port      [resolved: 7693]
# @adopt:dwell-sig-user      [resolved: neo4j]
# @adopt:dwell-sig-password  [resolved: dwell-sig]

NEO4J_CONTAINER="dwell-sig"
NEO4J_USER="neo4j"
NEO4J_PASS="dwell-sig"

run_query() {
  docker exec "$NEO4J_CONTAINER" cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASS" "$1" 2>&1
}

run_file() {
  local f="$1"
  docker cp "$f" "$NEO4J_CONTAINER":/tmp/sig-query.cypher
  docker exec "$NEO4J_CONTAINER" cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASS" --file /tmp/sig-query.cypher 2>&1
}

case "$1" in

  # ── List all modules ─────────────────────────────────────────────────────
  modules)
    run_query "MATCH (m:TGTModule) RETURN m.name AS module, m.tier AS tier, m.capability AS capability ORDER BY m.tier, m.name;"
    ;;

  # ── Graph health ─────────────────────────────────────────────────────────
  status)
    echo "=== Node counts ==="
    run_query "MATCH (n) RETURN head(labels(n)) AS label, count(n) AS count ORDER BY count DESC;"
    echo ""
    echo "=== Relationship counts ==="
    run_query "MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS count ORDER BY count DESC;"
    ;;

  # ── Events consumed by a module ──────────────────────────────────────────
  consumes)
    MODULE="$2"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})-[:CONSUMES]->(t:TGTType)
      OPTIONAL MATCH (t)-[:HAS_FIELD]->(f:TGTField)
      RETURN t.name AS type, t.description AS description,
             collect(f.name + ': ' + f.type) AS fields
      ORDER BY t.name;
    "
    ;;

  # ── Events emitted by a module ───────────────────────────────────────────
  emits)
    MODULE="$2"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})-[:EMITS]->(t:TGTType)
      OPTIONAL MATCH (t)-[:HAS_FIELD]->(f:TGTField)
      RETURN t.name AS type, t.description AS description,
             collect(f.name + ': ' + f.type) AS fields
      ORDER BY t.name;
    "
    ;;

  # ── Invariants a module must enforce ─────────────────────────────────────
  invariants)
    MODULE="$2"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})-[:ENFORCES]->(i:TGTInvariant)
      RETURN i.name AS invariant, i.description AS description, i.violation AS violation
      ORDER BY i.name;
    "
    ;;

  # ── Files a module should produce ────────────────────────────────────────
  files)
    MODULE="$2"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})
      MATCH (fi:TGTFile)
      WHERE (m)-[:CONTAINS]->(fi) OR (fi)-[:BELONGS_TO]->(m)
      OPTIONAL MATCH (fi)-[:CONTAINS]->(fn:TGTFunction)
      RETURN fi.name AS file, fi.description AS description,
             collect(fn.name) AS functions
      ORDER BY fi.name;
    "
    ;;

  # ── Functions a module must implement ────────────────────────────────────
  functions)
    MODULE="$2"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})
      MATCH (fi:TGTFile)
      WHERE (m)-[:CONTAINS]->(fi) OR (fi)-[:BELONGS_TO]->(m)
      MATCH (fi)-[:CONTAINS]->(fn:TGTFunction)
      OPTIONAL MATCH (fn)-[:ACCEPTS]->(a:TGTType)
      OPTIONAL MATCH (fn)-[:RETURNS]->(r:TGTType)
      RETURN fi.name AS file, fn.name AS function, fn.description AS description,
             collect(distinct a.name) AS accepts, collect(distinct r.name) AS returns
      ORDER BY fi.name, fn.name;
    "
    ;;

  # ── Full human-readable brief ─────────────────────────────────────────────
  brief)
    MODULE="$2"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "  SIG Brief: $MODULE"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""

    echo "── Module ──────────────────────────────────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'}) RETURN m.name AS name, m.tier AS tier, m.capability AS capability, m.path AS path;"
    echo ""

    echo "── Consumes (events to subscribe to) ───────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'})-[:CONSUMES]->(t:TGTType) RETURN t.name AS type, t.description AS description ORDER BY t.name;"
    echo ""

    echo "── Emits (events to publish) ────────────────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'})-[:EMITS]->(t:TGTType) RETURN t.name AS type, t.description AS description ORDER BY t.name;"
    echo ""

    echo "── Invariants (must enforce) ────────────────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'})-[:ENFORCES]->(i:TGTInvariant) RETURN i.name AS invariant, i.description AS description ORDER BY i.name;"
    echo ""

    echo "── Files to create ──────────────────────────────────────────────"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})
      MATCH (fi:TGTFile)
      WHERE (m)-[:CONTAINS]->(fi) OR (fi)-[:BELONGS_TO]->(m)
      RETURN fi.name AS file, fi.description AS description ORDER BY fi.name;
    "
    echo ""

    echo "── Functions to implement ───────────────────────────────────────"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})
      MATCH (fi:TGTFile)
      WHERE (m)-[:CONTAINS]->(fi) OR (fi)-[:BELONGS_TO]->(m)
      MATCH (fi)-[:CONTAINS]->(fn:TGTFunction)
      RETURN fi.name AS file, fn.name AS function, fn.description AS description ORDER BY fi.name, fn.name;
    "
    echo ""

    echo "── Dependencies ─────────────────────────────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'})-[:DEPENDS_ON]->(d:TGTModule) RETURN d.name AS depends_on ORDER BY d.name;"
    ;;

  # ── JSON brief (for subagent consumption) ────────────────────────────────
  json)
    MODULE="$2"
    # Output structured JSON via Python aggregation of cypher results
    python3 - "$MODULE" << 'PYEOF'
import subprocess, json, sys, re

MODULE = sys.argv[1]
CONTAINER = "dwell-sig"
USER = "neo4j"
PASS = "dwell-sig"

def query(cypher):
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "cypher-shell",
         "-u", USER, "-p", PASS, "--format", "plain", cypher],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().split("\n")
    if len(lines) <= 1:
        return []
    header = [h.strip('"') for h in lines[0].split(", ")]
    rows = []
    for line in lines[1:]:
        if not line.strip() or line.startswith("("):
            continue
        # Simple CSV-like parse (handles quoted strings)
        values = re.findall(r'"(?:[^"\\]|\\.)*"|\[.*?\]|[^,]+', line)
        values = [v.strip().strip('"') for v in values]
        if len(values) == len(header):
            rows.append(dict(zip(header, values)))
    return rows

module_info = query(f"MATCH (m:TGTModule {{name: '{MODULE}'}}) RETURN m.name AS name, m.tier AS tier, m.capability AS capability, m.path AS path;")
consumes = query(f"MATCH (m:TGTModule {{name: '{MODULE}'}})-[:CONSUMES]->(t:TGTType) RETURN t.name AS type, t.description AS description ORDER BY t.name;")
emits = query(f"MATCH (m:TGTModule {{name: '{MODULE}'}})-[:EMITS]->(t:TGTType) RETURN t.name AS type, t.description AS description ORDER BY t.name;")
invariants = query(f"MATCH (m:TGTModule {{name: '{MODULE}'}})-[:ENFORCES]->(i:TGTInvariant) RETURN i.name AS name, i.description AS description, i.violation AS violation ORDER BY i.name;")
files = query(f"""
  MATCH (m:TGTModule {{name: '{MODULE}'}})
  MATCH (fi:TGTFile)
  WHERE (m)-[:CONTAINS]->(fi) OR (fi)-[:BELONGS_TO]->(m)
  RETURN fi.name AS file, fi.description AS description ORDER BY fi.name;
""")
functions = query(f"""
  MATCH (m:TGTModule {{name: '{MODULE}'}})
  MATCH (fi:TGTFile)
  WHERE (m)-[:CONTAINS]->(fi) OR (fi)-[:BELONGS_TO]->(m)
  MATCH (fi)-[:CONTAINS]->(fn:TGTFunction)
  RETURN fi.name AS file, fn.name AS function, fn.description AS description ORDER BY fi.name, fn.name;
""")

brief = {
    "module": MODULE,
    "meta": module_info[0] if module_info else {},
    "consumes": consumes,
    "emits": emits,
    "invariants": invariants,
    "files": files,
    "functions": functions,
}
print(json.dumps(brief, indent=2))
PYEOF
    ;;

  # ── Verification contract for right bookend ──────────────────────────────
  verify-contract)
    MODULE="$2"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "  Verification Contract: $MODULE"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Each item below must have a corresponding test."
    echo ""

    echo "── Must subscribe to (CONSUMES) ────────────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'})-[:CONSUMES]->(t:TGTType) RETURN t.name AS event_type ORDER BY t.name;"
    echo ""

    echo "── Must emit (EMITS) ────────────────────────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'})-[:EMITS]->(t:TGTType) RETURN t.name AS event_type ORDER BY t.name;"
    echo ""

    echo "── Must enforce (INVARIANTS) ────────────────────────────────────"
    run_query "MATCH (m:TGTModule {name: '$MODULE'})-[:ENFORCES]->(i:TGTInvariant) RETURN i.name AS invariant, i.violation AS violation_condition ORDER BY i.name;"
    echo ""

    echo "── Must implement (FUNCTIONS) ───────────────────────────────────"
    run_query "
      MATCH (m:TGTModule {name: '$MODULE'})
      MATCH (fi:TGTFile)
      WHERE (m)-[:CONTAINS]->(fi) OR (fi)-[:BELONGS_TO]->(m)
      MATCH (fi)-[:CONTAINS]->(fn:TGTFunction)
      RETURN fn.name AS function, fn.description AS description ORDER BY fn.name;
    "
    ;;

  *)
    echo "Usage: sig-query.sh <command> [module]"
    echo ""
    echo "Commands:"
    echo "  modules                  List all modules"
    echo "  status                   Graph node/relationship counts"
    echo "  brief <module>           Human-readable module brief"
    echo "  json <module>            JSON brief for subagent consumption"
    echo "  consumes <module>        Events consumed"
    echo "  emits <module>           Events emitted"
    echo "  invariants <module>      Invariants to enforce"
    echo "  files <module>           Files to create"
    echo "  functions <module>       Functions to implement"
    echo "  verify-contract <module> Verification contract for right bookend"
    ;;
esac
