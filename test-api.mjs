// Quick test script for API endpoints
async function run() {
    console.log("Fetching local API report...");
    try {
        const res = await fetch("http://localhost:3000/api/executive/report?surveyId=3");
        const data = await res.json();
        console.log("Status:", res.status);
        console.log("UPH Index:", data.globalSatisfactionIndex);
        console.log("Units:", data.units?.length);
    } catch (e) {
        console.error("Fetch failed", e);
    }
}
run();
