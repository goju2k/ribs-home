FROM python:3.13-slim

WORKDIR /app
COPY ./app/py-api-server/nlp-test/main.py ./
RUN pip install --upgrade pip && pip install --no-cache-dir fastapi uvicorn sentence-transformers

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]