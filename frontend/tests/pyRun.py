"""Runs pyTracer.lcv_run for one request read from stdin (JSON: code, definitions, testCase, maxSteps) and prints the result JSON."""
import sys, json, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'js', 'runners'))
import pyTracer
req = json.loads(sys.stdin.read())
sys.stdout.write(pyTracer.lcv_run(req['code'], req.get('definitions', ''), json.dumps(req.get('testCase', {})), req.get('maxSteps', 5000), 20000))
