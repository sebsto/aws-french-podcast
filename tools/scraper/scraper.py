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

    return episode_data

def update_episode_files(podcast_dir, episode_title_id_map):
    import os
    for filename in os.listdir(podcast_dir):
        file_path = os.path.join(podcast_dir, filename)
        if os.path.isfile(file_path) and filename.endswith(".md"):
            with open(file_path, 'r', encoding='utf-8') as file:
                lines = file.readlines()

            print(f"Processing file: {file_path}")
            updated_lines = []
            for line in lines:
                if line.startswith("title:"):
                    title = line.split(":")[1].strip().strip('"')
                    episode_id = episode_title_id_map.get(title)
                    if episode_id:
                        print(f"Found episode ID: {episode_id} for title: {title}")
                        updated_lines.append(f"appleEpisodeId: {episode_id}\n")
                if not line.startswith("appleEpisodeId:"):
                    updated_lines.append(line)

            with open(file_path, 'w', encoding='utf-8') as file:
                file.writelines(updated_lines)

def read_apple_id():
    # read output.csv file and generate a dictionary
    # of episode title and appleEpisodeId
    import csv 
    episode_title_id_map = {}

    with open('output.csv', 'r', encoding='utf-8') as file:
        reader = csv.reader(file)
        for line in reader:
            episode_id, title, time_text = line
            episode_title_id_map[title] = episode_id

    return episode_title_id_map

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

def test_update_episode_files(tmp_path):
    episode_title_id_map = {'Episode Name': '1000000000000', 'Another Episode': '2000000000000'}
    podcast_dir = tmp_path / '_podcasts'
    podcast_dir.mkdir()
    (podcast_dir / 'episode_1.md').write_text("---\ntitle: \"Episode Name\"\n---\n")
    (podcast_dir / 'episode_2.md').write_text("---\ntitle: \"Another Episode\"\nappleEpisodeId: 123456\n---\n")
    update_episode_files(str(podcast_dir), episode_title_id_map)
    assert (podcast_dir / 'episode_1.md').read_text() == "---\ntitle: \"Episode Name\"\nappleEpisodeId: 1000000000000\n---\n"
    assert (podcast_dir / 'episode_2.md').read_text() == "---\ntitle: \"Another Episode\"\nappleEpisodeId: 2000000000000\n---\n"

if __name__ == '__main__':
    # test_extract_episode_data()
    # test_write_to_csv('.')
    apple_id_map = read_apple_id()
    update_episode_files("podcasts", apple_id_map)
