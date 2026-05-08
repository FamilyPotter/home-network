"""Figure out how to authenticate to the TL-SG108PE switch."""
import urllib.request, urllib.parse, http.cookiejar, re

base = 'http://192.168.0.105'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

# GET root
resp = opener.open(base + '/')
html = resp.read().decode(errors='ignore')
print('Root status:', resp.status)
print('Has logonInfo:', 'logonInfo' in html)
print('g_level:', re.search(r'g_level=(\d+)', html))
print()

# The root shows a frameset - one of the frames is the login/top page
# Let's look at Top.htm which might have auth
resp2 = opener.open(base + '/Top.htm')
html2 = resp2.read().decode(errors='ignore')
print('Top.htm status:', resp2.status)
print(html2[:1000])
print()

# Try to access PortStatisticsRpm.htm - will it redirect to login?
resp3 = opener.open(base + '/PortStatisticsRpm.htm')
html3 = resp3.read().decode(errors='ignore')
print('PortStats status:', resp3.status)
print('Has logonInfo:', 'logonInfo' in html3)
print(html3[:500])
print()
print('Cookies after requests:')
for c in jar:
    print(f'  {c.name}={c.value}')
