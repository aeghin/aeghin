import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";


export async function GET(req: NextRequest) {

const organizationInfo = await prisma.organization.findMany({
    include: {
        memberships: true
    }
});

if (!organizationInfo) return NextResponse.json({ success: false, error: "something went wrong." });

return NextResponse.json({ organizationInfo }, { headers: { "Access-Control-Allow-Origin": "http://localhost:8081"}});

};