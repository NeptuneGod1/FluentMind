import requests

url = 'http://127.0.0.1:5000/backfill_readability_scores'
try:
    resp = requests.get(url)
    print('Status:', resp.status_code)
    print('Response:', resp.text)
except Exception as e:
    print('Error:', e)
