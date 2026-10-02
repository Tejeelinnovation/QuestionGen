# Document AI Microservice

Standalone high-memory extraction microservice for academic textbooks, research papers, and handwritten notes.
Designed to run on **Hugging Face Spaces (Free 16 GB RAM Tier)** or any Docker environment.

---

### Features
- **Textbook & Chapter Extraction**: Extracts Table of Contents, chapter boundaries, and page-by-page structures.
- **LaTeX Math & Chemistry**: Converts equations, formulas, and chemistry notations to standard LaTeX (`$...$`).
- **Multi-Column Reading Order**: Intelligently identifies 2-column, hybrid, and newspaper flows.
- **Diagrams & Captions**: Crops figures/images and pairs them with their closest captions based on bounding-box proximity.
- **Handwritten Notes Support**: Segments handwritten student/teacher notes and exam worksheets.
- **Webhook Callbacks**: Asynchronously pushes structured JSON payloads straight into the Django Question Generation System.

---

### How to Deploy for Free on Hugging Face Spaces (16 GB RAM)

1. **Create Free Account**:
   - Go to [huggingface.co](https://huggingface.co/) and Sign Up / Log In.
2. **Create Space**:
   - Click your profile icon $\rightarrow$ **New Space**.
   - **Space Name**: `question-gen-doc-ai` (or any name you prefer).
   - **Space SDK**: Select **Docker** $\rightarrow$ **Blank**.
   - **Hardware**: Choose **CPU Basic (2 vCPU · 16 GB RAM · Free)**.
   - Click **Create Space**.
3. **Upload Files**:
   - In your newly created Space, click **Files** $\rightarrow$ **Add file** $\rightarrow$ **Upload files**.
   - Drag & drop all files from this `document_ai_worker/` directory:
     - `Dockerfile`
     - `requirements.txt`
     - `app.py`
     - `engine/` (upload the whole `engine` folder with `__init__.py`, `schema.py`, `textbook_pipeline.py`, `handwriting_pipeline.py`)
   - Click **Commit changes to main**.
4. **Copy Your Live URL**:
   - Hugging Face will automatically build your Docker container in ~2 minutes.
   - Once the badge says **Running**, click the 3 dots in the top right $\rightarrow$ **Embed this Space** (or copy Direct URL):
     `https://<your-username>-question-gen-doc-ai.hf.space`
5. **Connect to Django**:
   - Add this environment variable in Render (and your local `.env`):
     ```bash
     DOCUMENT_AI_MICROSERVICE_URL=https://<your-username>-question-gen-doc-ai.hf.space
     ```
   - That's it! Your Django Queue Worker will now automatically delegate all heavy PDF extractions to this 16 GB AI worker.

---

### Local Testing (Without Docker)

```bash
cd document_ai_worker
pip install -r requirements.txt
uvicorn app:app --reload --port 7860
```
- Open `http://localhost:7860/docs` in your browser to inspect interactive Swagger API documentation.
