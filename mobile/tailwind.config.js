/** @type {import('tailwindcss').Config} */
module.exports = {
    // NOTE: Update this to include the paths to all of your component files.
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                whatsapp: {
                    teal: "#075E54",
                    green: "#25D366",
                    lightGreen: "#DCF8C6",
                    bg: "#ECE5DD",
                }
            }
        },
    },
    plugins: [],
};
