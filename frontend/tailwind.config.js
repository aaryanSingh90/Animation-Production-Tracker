/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        stage: {
          notStarted: "#6B7280",
          inProgress: "#F59E0B",
          submitted: "#3B82F6",
          approved: "#10B981",
          rejected: "#EF4444",
          issue: "#EF4444",
          extended: "#8B5CF6"
        }
      }
    }
  },
  plugins: []
};
