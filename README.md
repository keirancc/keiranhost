# Backend Installation (Python)

1. **Clone the repository**
   
   ```sh
   git clone https://github.com/keirancc/keiranhost.git
   ```
   
3. **Set up a _virtual environment_**
   
   ```sh
   python3 -m venv .venv
   source .venv/bin/activate
   ```
   
5. **Install dependencies**
   
   ```sh
   pip install -r requirements.txt
   ```
   
7. **Run the server**
   
   ```sh
   uvicorn main:app --reload
   ```

# Frontend Installation (Vite + React)

1. **Navigate to frontend directory**
   ```sh
   cd ../frontend
   ```
2. **Install dependencies**
   ```sh
   pnpm install
   ```
3. **Run the development server**
   ```sh
   pnpm run dev
   ```

# To run the production build

1. **Navigate to frontend directory**
   ```sh
   cd ../frontend
   ```
2. **Install dependencies**
   ```sh
   pnpm install
   ```
3. **Build the app**
   ```sh
   pnpm build
   ```
4. **Run the production server**
   ```sh
   pnpm preview
   ```
