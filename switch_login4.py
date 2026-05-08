"""Find the switch login form action and test POST login."""
import urllib.request, urllib.parse, http.cookiejar, re

base = 'http://192.168.0.105'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# GET the Logon.htm page from local machine (no auth needed here, but the form action is what matters)
# We need to simulate what the NAS would see
# Let's use a different User-Agent or try from NAS perspective
# Actually we can just look at the full HTML

resp = opener.open(base + '/Logon.htm')
html = resp.read().decode('latin-1')
print('Login page length:', len(html))

# Find form action
forms = re.findall(r'<form[^>]*>', html, re.IGNORECASE)
print('Forms found:', forms)

actions = re.findall(r'action=["\']?([^"\'>\s]+)', html, re.IGNORECASE)
print('Actions found:', actions)

# Find doOnclick and form submit logic
onclick = html.find('doOnclick')
print('\ndoOnclick function (first 500 chars):', html[onclick:onclick+500])

# Also look for the form tag
form_idx = html.lower().find('<form')
print('\nForm HTML:', html[form_idx:form_idx+300] if form_idx >= 0 else 'Not found')

# Try to find the POST target
input_tags = re.findall(r'<input[^>]+>', html, re.IGNORECASE)[:20]
print('\nInput tags:')
for t in input_tags:
    print(' ', t)
