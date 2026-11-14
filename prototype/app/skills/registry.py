import json
from pathlib import Path

SKILLS = ['workshop_report', 'fit_gap', 'steering_deck']


def skill_manifest(name):
    if name not in SKILLS:
        raise ValueError(f'Unknown skill: {name}')
    return json.loads((Path(__file__).resolve().parent / name / 'manifest.json').read_text())
