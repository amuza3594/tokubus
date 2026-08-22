import { HashRouter, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import NewSurvey from "./pages/NewSurvey";
import SurveyTrip from "./pages/SurveyTrip";
import SurveyDetail from "./pages/SurveyDetail";
import Settings from "./pages/Settings";

function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewSurvey />} />
          <Route path="/survey/:surveyId/trip" element={<SurveyTrip />} />
          <Route path="/survey/:surveyId" element={<SurveyDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
