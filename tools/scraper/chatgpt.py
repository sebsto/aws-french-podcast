import re

html_document = """
<time data-test-we-datetime="" datetime="2024-07-19T04:00:00.000Z" aria-label="July 19, 2024" class="">JUL 19, 2024</time>
</li>
<!----> </ul>
<a href="https://podcasts.apple.com/us/podcast/sportall/id1452118442?i=1000662702955" class="link tracks__track__link--block" data-metrics-click="{&quot;actionType&quot;:&quot;navigate&quot;,&quot;actionUrl&quot;:&quot;https://podcasts.apple.com/us/podcast/sportall/id1452118442?i=1000662702955&quot;,&quot;targetType&quot;:&quot;card&quot;,&quot;targetId&quot;:&quot;1000662702955&quot;}" data-episode-id="1000662702955">
Sportall
</a>
<time data-test-we-datetime="" datetime="2024-07-20T04:00:00.000Z" aria-label="July 20, 2024" class="">JUL 20, 2024</time>
</li>
<!----> </ul>
<a href="https://podcasts.apple.com/us/podcast/sportall/id1452118443?i=1000662702966" class="link tracks__track__link--block" data-metrics-click="{&quot;actionType&quot;:&quot;navigate&quot;,&quot;actionUrl&quot;:&quot;https://podcasts.apple.com/us/podcast/sportall/id1452118443?i=1000662702966&quot;,&quot;targetType&quot;:&quot;card&quot;,&quot;targetId&quot;:&quot;1000662702966&quot;}" data-episode-id="1000662702966">
Sportall Episode 2
</a>
"""

# Regex pattern to match the sequence
pattern = re.compile(r'<time[^>]*datetime="([^"]+)"[^>]*>[^<]*</time>.*?<a[^>]*data-episode-id="([^"]+)"[^>]*>([^<]+)</a>', re.DOTALL)

# Find all matches
matches = pattern.findall(html_document)

# Print results
for datetime, data_episode_id, anchor_text in matches:
    print(f"Datetime: {datetime}")
    print(f"Data Episode ID: {data_episode_id}")
    print(f"Anchor Text: {anchor_text}")
    print("----")
