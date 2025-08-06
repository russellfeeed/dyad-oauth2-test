import { MadeWithDyad } from "@/components/made-with-dyad";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4">OAuth2 Tester</h1>
        <p className="text-xl text-gray-600 mb-6">
          Easily test OAuth2 flows and endpoints with this tool.
        </p>
        <Button asChild>
          <Link to="/oauth2-tester">Try the OAuth2 Tester Tool</Link>
        </Button>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;