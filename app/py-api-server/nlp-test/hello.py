from time import time
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

korean_query = "배터리 수명이 좋은 16GB 램의 노트북을 찾고 있어요"

start_time = time()
embedding = model.encode(korean_query)
print(embedding)
print(time() - start_time)

korean_query = "하지만 드라군이 출동한다면 어떨까"

start_time = time()
embedding = model.encode(korean_query)
print(embedding)
print(time() - start_time)