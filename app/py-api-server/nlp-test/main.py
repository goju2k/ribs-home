from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
app = FastAPI()

class EmbedRequest(BaseModel):
    text: str

@app.post("/embed")
async def embed(req: EmbedRequest):
    vector = model.encode(req.text).tolist()
    return {"embedding": vector}

@app.get("/")
def test():
    return {"Hello": "World"}