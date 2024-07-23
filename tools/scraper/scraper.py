import re
from typing import List, Tuple

# Function to extract episode data from HTML string
def extract_episode_data(html: str) -> List[Tuple[str, str, str]]:
    episode_data: List[Tuple[str, str, str]] = []
    pattern = r'<time[^>]*datetime="([^"]+)"[^>]*>[^<]*</time>.*?<a[^>]*data-episode-id="([^"]+)"[^>]*>([^<]+)</a>'
    matches = re.findall(pattern, html, re.DOTALL)

    for match in matches:
        time_text, episode_id, name = match
        episode_data.append((episode_id, "\"" + name.strip() + "\"", time_text))

    print(episode_data)
    return episode_data

# Function to write episode data to a CSV file
def write_to_csv(episode_data: List[Tuple[str, str, str]], filename: str) -> None:
    with open(filename, 'w', newline='', encoding='utf-8') as file:
        for episode_id, name, time_text in episode_data:
            file.write(f'{episode_id},{name},{time_text}\n')

# Tests
def test_extract_episode_data():
    html = '''
              <time data-test-we-datetime="" datetime="2024-07-19T04:00:00.000Z" aria-label="July 19, 2024" class="">JUL 19, 2024</time>
            <a href="https://podcasts.apple.com/us/podcast/example-podcast/id123456789?i=1000000000000" data-episode-id="1000000000000">Episode Name</a>

              <time data-test-we-datetime="" datetime="2024-07-12T04:00:00.000Z" aria-label="July 19, 2024" class="">JUL 19, 2024</time> <a href="https://podcasts.apple.com/us/podcast/another-podcast/id987654321?i=2000000000000" data-episode-id="2000000000000">Another Episode</a>
    '''
    expected = [
        ('1000000000000', 'Episode Name', '2024-07-19T04:00:00.000Z'),
        ('2000000000000', 'Another Episode', '2024-07-12T04:00:00.000Z')
    ]
    actual = extract_episode_data(html)
    assert actual == expected

def test_write_to_csv(tmp_path):
    episode_data = [
        ('1000000000000', 'Episode Name', '1:30:00'),
        ('2000000000000', 'Another Episode', '2:00:00')
    ]
    output_file = tmp_path + '/output.csv'
    write_to_csv(episode_data, str(output_file))

    with open(output_file, 'r', encoding='utf-8') as file:
        lines = file.readlines()

    expected = [
        '1000000000000,Episode Name,1:30:00\n',
        '2000000000000,Another Episode,2:00:00\n'
    ]
    assert lines == expected

if __name__ == '__main__':
    test_extract_episode_data()
    test_write_to_csv('.')
