"""run.py — CLI déclenchement à la demande (Option A validée).
Usage:
  python run.py            -> cycle par défaut (toutes sources, fenêtre 24h)
  python run.py --scope GN_NAT
  python run.py --demand 5
  python run.py --scope INTL
"""
import argparse
from reach_agent import agent

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Agent Reach — collecte on-demand KORA")
    p.add_argument("--scope", help="GN_NAT | INTL (filtre)")
    p.add_argument("--demand", type=int, help="nb d'articles demandés")
    a = p.parse_args()
    res = agent.run(demand=a.demand, scope_filter=a.scope)
    import json
    print(json.dumps(res, ensure_ascii=False, indent=2, default=str))
