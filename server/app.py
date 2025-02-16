import faiss
import sqlite3
import numpy as np
import requests
from bs4 import BeautifulSoup, Tag
from sentence_transformers import SentenceTransformer
from flask import Flask, request, jsonify
import os
from urllib.parse import urljoin, urlparse
import re
import sqlite3

app = Flask(__name__)

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

dimension = 384
faiss_meta_path = "faiss_metadata.index"
faiss_content_path = "faiss_content.index"
db_path = "documentation.db"

if os.path.exists(faiss_meta_path):
    metadata_index = faiss.read_index(faiss_meta_path)
else:
    metadata_index = faiss.IndexFlatL2(dimension)

if os.path.exists(faiss_content_path):
    content_index = faiss.read_index(faiss_content_path)
else:
    content_index = faiss.IndexFlatL2(dimension)

conn = sqlite3.connect(db_path, check_same_thread=False)
cursor = conn.cursor()
cursor.execute("""
    CREATE TABLE IF NOT EXISTS metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        page_url TEXT UNIQUE
    )
""")
cursor.execute("""
    CREATE TABLE IF NOT EXISTS content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metadata_id INTEGER,
        text TEXT,
        FOREIGN KEY(metadata_id) REFERENCES metadata(id)
    )
""")
conn.commit()

def extract_metadata(doc_url, visited, depth=2):
    if depth == 0 or doc_url in visited:
        return []
    try:
        response = requests.get(doc_url, timeout=5)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching {doc_url}: {e}")
        return []
    visited.add(doc_url)
    soup = BeautifulSoup(response.text, "html.parser")
    metadata = []
    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        if href and not href.startswith(('javascript:', 'mailto:')):
            full_url = urljoin(doc_url, href)
            title = link.text.strip() or full_url  
            print(title.lower(), full_url)
            metadata.append((title.lower(), full_url))
            
            if urlparse(full_url).netloc == urlparse(doc_url).netloc:
                metadata.extend(extract_metadata(full_url, visited, depth - 1))
    return list(set(metadata))

def clean_text(text):
    text = re.sub(r'\s+', ' ', text.strip())
    text = re.sub(r'[^\w\s\-.,!?()\'"]', '', text)
    return text

def extract_content(page_url):
    response = requests.get(page_url)
    soup = BeautifulSoup(response.text, "html.parser")

    for unwanted in soup.select("nav, footer, aside, script, style"):
        unwanted.extract()

    structured_data = {}
    current_heading = None
    result = []

    for element in soup.body.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "pre", "code", "li"], recursive=True):
        if element.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            current_heading = element.get_text(strip=True)
            structured_data[current_heading] = []
        elif current_heading:
            structured_data[current_heading].append(element.get_text(strip=True))

    for heading, content in structured_data.items():
        text = f"\n{heading}: " + '\n'.join(content)
        result.append(clean_text(text))
    return result

def normalize(vectors):
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)

@app.route("/intelligent-search", methods=["POST"])
def search():
    global metadata_index, content_index
    data = request.json
    query = data["query"]
    metadata_links = data["links"]

    index_metadata(metadata_links)

    query_embedding = model.encode([query], convert_to_numpy=True)
    query_embedding = normalize(query_embedding)

    similarity_scores, best_meta_idx = metadata_index.search(query_embedding, 3)
    best_meta_idx = best_meta_idx[0]
    best_meta_score = similarity_scores[0][0]

    if best_meta_idx[0] == -1:
        print('here1')
        return jsonify({"error": "No metadata results found"}), 404

    meta_results = []
    for idx in best_meta_idx:
        idx = int(idx)
        cursor.execute("SELECT id, title, page_url FROM metadata WHERE id = ?", (idx,))
        result = cursor.fetchone()
        if result:
            meta_results.append(result)

    if not meta_results:
        print('here2 ', best_meta_idx, meta_results)
        return jsonify({"error": "No metadata match found"}), 404

    meta_id, title, page_url = meta_results[0]

    cursor.execute("SELECT text FROM content WHERE metadata_id = ?", (meta_id,))
    stored_texts = [row[0] for row in cursor.fetchall()]

    if not stored_texts:
        stored_texts = extract_content(page_url)
        cursor.executemany("INSERT INTO content (metadata_id, text) VALUES (?, ?)",
                           [(meta_id, text) for text in stored_texts])
        conn.commit()

    stored_texts_ids = np.array(range(len(stored_texts)), dtype=np.int64)
    stored_texts_embeddings = model.encode(stored_texts, convert_to_numpy=True)
    stored_texts_embeddings = normalize(stored_texts_embeddings)

    content_index = faiss.IndexFlatIP(stored_texts_embeddings.shape[1])
    content_index = faiss.IndexIDMap(content_index)
    content_index.add_with_ids(stored_texts_embeddings, stored_texts_ids)

    similarity_scores, top_idx = content_index.search(query_embedding, 1)
    best_text_idx = top_idx[0][0]
    best_content_score = similarity_scores[0][0]

    if best_text_idx == -1 or best_text_idx >= len(stored_texts):
        print('here3', top_idx[0])
        return jsonify({"error": "No relevant content found"}), 404

    best_text = stored_texts[best_text_idx]

    return jsonify({
        "best_match": page_url,
        "metadata_score": str(best_meta_score),
        "content_score": str(best_content_score),
        "text": best_text,
        "recommended_links": [obj for obj in meta_results if obj[2] != page_url]
    })



def index_metadata(metadata):
    global metadata_index

    cursor.execute("DELETE FROM metadata;")
    cursor.executemany("INSERT OR IGNORE INTO metadata (title, page_url) VALUES (?, ?)", metadata)
    conn.commit()

    cursor.execute("SELECT id, title FROM metadata")
    metadata_records = cursor.fetchall()
    metadata_ids = np.array([record[0] for record in metadata_records], dtype=np.int64)
    metadata_texts = [record[1] for record in metadata_records]
    metadata_embeddings = model.encode(metadata_texts, convert_to_numpy=True)

    metadata_embeddings = normalize(metadata_embeddings)

    metadata_index = faiss.IndexFlatIP(metadata_embeddings.shape[1])
    metadata_index = faiss.IndexIDMap(metadata_index)
    metadata_index.add_with_ids(metadata_embeddings, metadata_ids)

    faiss.write_index(metadata_index, faiss_meta_path)

if __name__ == "__main__":
    app.run(debug=True, port=8080)