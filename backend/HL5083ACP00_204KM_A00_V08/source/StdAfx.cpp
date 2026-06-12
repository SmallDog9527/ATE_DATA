// stdafx.cpp : source file that includes just the standard includes
//	DUT.pch will be the pre-compiled header
//	stdafx.obj will contain the pre-compiled type information

#include "stdafx.h"
#include "sub.h"

// TODO: reference any additional headers you need in STDAFX.H
// and not in this file



////////FPVI resource////////////////

FPVI10 fpvi0(0,"FP_V5VtoVBUS");
FPVI10 fpvi1(1,"FP_V5VtoVCC");
FPVI10 fpvi2(2,"FP_V5V");
FPVI10 fpvi3(3,"FP_VBUS_P01");

FPVI10& V5VtoVBUS0 = fpvi0;
FPVI10& V5VtoVBUS1 = fpvi0;

FPVI10& VBUSOUT0toVBUS0 = fpvi0;
FPVI10& VBUSOUT1toVBUS1 = fpvi0;


FPVI10& V5VtoCC1_P0 = fpvi1;
FPVI10& V5VtoCC2_P0 = fpvi1;
FPVI10& V5VtoCC1_P1 = fpvi1;
FPVI10& V5VtoCC2_P1 = fpvi1;

FPVI10& V5V= fpvi2;

FPVI10& VBUSP0 = fpvi3; 
FPVI10& VBUSP1 = fpvi3; 


////////FOVI resource////////////////
FOVI fovi0(0,"FO_VBUS1_INTB");
FOVI fovi1(1,"FO_CC1_P01");
FOVI fovi2(2,"FO_CC2_P01");
FOVI fovi3(3,"FO_SBU1_P01"); 
FOVI fovi4(4,"FO_SBU2_P01" );
FOVI fovi5(5,"FO_SBU_OVP_P01");
FOVI fovi6(6,"FO_FRS_EN_P01");
FOVI fovi7(7,"FO_SBU1_OUT_P01");

FOVI fovi8(8,"FO_20V5A_OFF_P01");
FOVI fovi9(9,"FO_VBUS_DIV_P01");
FOVI fovi10(10,"FO_CC1_SYS_P01");
FOVI fovi11(11,"FO_CC2_SYS_P01");
FOVI fovi12(12,"FO_SRC_CUR_P01");
FOVI fovi13(13,"FO_VDDI0");
FOVI fovi14(14,"FO_V5V_DIV");
FOVI fovi15(15,"FO_SNK_CTL_P01");

FOVI fovi32(16,"FO_SBU2_OUT_P01");
FOVI fovi33(17,"FO_VBUS_OUT_SNS_P01");
FOVI fovi34(18,"FO_SITCK_BOARDCK");
FOVI fovi35(19,"FO_CESD");
FOVI fovi36(20,"FO_PWUP");
FOVI fovi37(21,"FO_V5V");
FOVI fovi38(22,"FO_VIN_3V3");
FOVI fovi39(23,"FO_PRD_LDO");


FOVI& FOVBUS_P1 = fovi0;
FOVI& FOINTB = fovi0;


FOVI& CC1_P0 = fovi1;
FOVI& CC1_P1 = fovi1;

FOVI& CC2_P0 = fovi2;
FOVI& CC2_P1 = fovi2;

FOVI& SBU1_P0 = fovi3;
FOVI& SBU1_P1 = fovi3;

FOVI& SBU2_P0= fovi4;
FOVI& SBU2_P1= fovi4;

FOVI& SBU_OVP_P0 = fovi5;
FOVI& SBU_OVP_P1 = fovi5;

FOVI& FRS_EN_P0 = fovi6;
FOVI& FRS_EN_P1 = fovi6;

FOVI& SBU1_OUT_P0 = fovi7;
FOVI& SBU1_OUT_P1 = fovi7;


FOVI& PA_20V5A_OFF= fovi8;
FOVI& PB_20V5A_OFF= fovi8;

FOVI& VBUS_DIV_P0=fovi9;
FOVI& VBUS_DIV_P1=fovi9;

FOVI& CC1_SYS_P0= fovi10;
FOVI& CC1_SYS_P1= fovi10;


FOVI& CC2_SYS_P0= fovi11;
FOVI& CC2_SYS_P1= fovi11;


FOVI& SRC_CUR_P0= fovi12;
FOVI& SRC_CUR_P1= fovi12;

FOVI& VDDIO= fovi13;

FOVI& VOPOUT= fovi14;


FOVI& SNK_CTL_P0= fovi15;
FOVI& SNK_CTL_P1= fovi15;



FOVI& SBU2_OUT_P0 = fovi32;
FOVI& SBU2_OUT_P1 = fovi32;

FOVI& VBUS_OUT_SNS_P0 = fovi33;
FOVI& VBUS_OUT_SNS_P1 = fovi33;

FOVI& SITEBDCK= fovi34;

FOVI&  CESD= fovi35;
FOVI&  SDA= fovi35;
FOVI&  SCL= fovi35;
FOVI&  INTB= fovi35;
FOVI&  PULLSOURCE_V5V_DIV= fovi35;
 

FOVI& I2C_R_UP= fovi36;
FOVI& INTB_R_UP= fovi36;


FOVI& FO_V5V= fovi37;
FOVI& VIN_3V3= fovi38;

FOVI& LDO3V3= fovi39; 
FOVI& V5V_DIV= fovi39;


FOVI& RPD1_P0= fovi35;
FOVI& RPD1_P1= fovi39;
FOVI& RPD2_P0 = fovi39;
FOVI& RPD2_P1 = fovi39;
//////QVM resource////////////////
/*QVM     qvm0(0);
QVM     qvm1(1);
QVM     qvm2(2);
QVM     qvm3(3)*/;

////////DIO QTMU HVI1K resource////////////////
DIO dio(0);
QTMU_PLUS qtmu0(0);

CBIT128 cbit;
//HVI1K hvi1k0(0);



I2C_Class I2C;
extern MyGetResult_Test MyGetResult;
int g_x_coords[SITE_NUM] = { -99999 }, g_y_coords[SITE_NUM] = { -99999 };

void I2C_Class::Write(int RegAddress, int WriteData){
	dio.I2CWriteData(I2C_DEVICE_ADDR, RegAddress, WriteData, WriteData);
}

void I2C_Class::Write(int RegAddress, int WriteData[SITE_NUM]){
	dio.I2CWriteData(I2C_DEVICE_ADDR, RegAddress, WriteData[SITE_1], WriteData[SITE_2]);
}

void I2C_Class::Read(int RegAddress, int ReadData[]){
	dio.I2CReadData(I2C_DEVICE_ADDR, RegAddress, 1);
	SERIAL ReadData[SITE] = dio.I2CGetReadData(SITE, 1);
}

void I2C_Class::Read(int ChipAddr, int RegAddress, int ReadData[]){
	dio.I2CReadData(ChipAddr, RegAddress, 1);
	SERIAL ReadData[SITE] = dio.I2CGetReadData(SITE, 1);
}

void I2C_Class::Write(int RegAddress, int WriteData, BYTE Mask){
	int ReadReg[SITE_NUM], WriteReg[SITE_NUM];

	if ((Mask & 0xFF) == 0xFF)
		I2C.Write(RegAddress, WriteData);
	else{
		I2C.Read(RegAddress, ReadReg);
		SERIAL WriteReg[SITE] = (ReadReg[SITE] & (~Mask)) | (WriteData & Mask);
		I2C.Write(RegAddress, WriteReg);
	}
}

void I2C_Class::Write(int RegAddress, int WriteData[SITE_NUM], BYTE Mask){
	int ReadReg[SITE_NUM], WriteReg[SITE_NUM];

	if ((Mask & 0xFF) == 0xFF)
		I2C.Write(RegAddress, WriteData);
	else{
		I2C.Read(RegAddress, ReadReg);
		SERIAL WriteReg[SITE] = (ReadReg[SITE] & (~Mask)) | (WriteData[SITE] & Mask);
		I2C.Write(RegAddress, WriteReg);
	}
}

void MyGetResult_Test::GetXYCoordinate(){
//	StsGetSingleDieCorXY(0, g_x_coords[0], g_y_coords[0]);	//Get the first site coordinate
//	for(int site=SITE_1; site<SITE_NUM; site++){
//		g_x_coords[site] = g_x_coords[0] - site*2;
//		g_y_coords[site] = g_y_coords[0] + site*2;
//		StsSetDieCorXY(site, g_x_coords[site], g_y_coords[site]);	//write coordinate to STDF file
//	}

	StsGetDieCorXY(g_x_coords, g_y_coords, SITE_NUM);		//updated on 7/26
//	StsSetDieCorXY(site, g_x_coords[site], g_y_coords[site]);	//write coordinate to STDF file
}

void MyGetResult_Test::CalcAverage(int pdata[SITE_NUM][100], int bits, int average_result[SITE_NUM]){

	int i, j;
	int key, sum[SITE_NUM] = { 0 };

	if (bits>19){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = (sum[SITE] - pdata[SITE][0] - pdata[SITE][1] - pdata[SITE][2] - pdata[SITE][3] - pdata[SITE][4] - pdata[SITE][bits - 1] - pdata[SITE][bits - 2] - pdata[SITE][bits - 3] - pdata[SITE][bits - 4] - pdata[SITE][bits - 5]) / (bits - 10);
		}
	}
	else if (bits>10){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = (sum[SITE] - pdata[SITE][0] - pdata[SITE][1] - pdata[SITE][2] - pdata[SITE][bits - 1] - pdata[SITE][bits - 2] - pdata[SITE][bits - 3]) / (bits - 6);
		}
	}
	else if (bits>6){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = (sum[SITE] - pdata[SITE][0] - pdata[SITE][1] - pdata[SITE][bits - 1] - pdata[SITE][bits - 2]) / (bits - 4);
		}
	}
	else if (bits>2){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = (sum[SITE] - pdata[SITE][0] - pdata[SITE][bits - 1]) / (bits - 2);
		}
	}
	else if (bits>1){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = sum[SITE] / bits;
		}
	}
	else{
		SERIAL
			average_result[SITE] = pdata[SITE][0];
	}
}

void MyGetResult_Test::CalcAverage(double pdata[SITE_NUM][100], int bits, double average_result[SITE_NUM]){

	int i, j;
	double key, sum[SITE_NUM] = { 0.0 };

	if (bits>10){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = (sum[SITE] - pdata[SITE][0] - pdata[SITE][1] - pdata[SITE][2] - pdata[SITE][bits - 1] - pdata[SITE][bits - 2] - pdata[SITE][bits - 3]) / (bits - 6);
		}
	}
	else if (bits>6){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = (sum[SITE] - pdata[SITE][0] - pdata[SITE][1] - pdata[SITE][bits - 1] - pdata[SITE][bits - 2]) / (bits - 4);
		}
	}
	else if (bits>2){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = (sum[SITE] - pdata[SITE][0] - pdata[SITE][bits - 1]) / (bits - 2);
		}
	}
	else if (bits>1){
		SERIAL{
			for (i = 1; i<bits; i++){
				key = pdata[SITE][i];
				for (j = i; j - 1 >= 0 && key<pdata[SITE][j - 1]; j--)
					pdata[SITE][j] = pdata[SITE][j - 1];
				pdata[SITE][j] = key;
			}
			for (i = 0; i<bits; i++)
				sum[SITE] = pdata[SITE][i] + sum[SITE];
			average_result[SITE] = sum[SITE] / bits;
		}
	}
	else{
		SERIAL
			average_result[SITE] = pdata[SITE][0];
	}
}

void MyGetResult_Test::ADCCalcAverage(int RegH, int RegL, int bits, int average_result[SITE_NUM]){

	int DataH[SITE_NUM], DataL[SITE_NUM], Rdata[SITE_NUM][100];

	for (int j = 0; j<bits; j++){
		I2C.Write(0x40, 0xC5);		//Average with 4samples data+trigger ADC manual copy
		delay_ms(1);
		I2C.Read(RegH, DataH);
		I2C.Read(RegL, DataL);
		SERIAL
			Rdata[SITE][j] = ((int)(DataH[SITE] * pow(2.0, 2.0))) & 0x03FC + (DataL[SITE] & 0x0003);
	}
	MyGetResult.CalcAverage(Rdata, bits, average_result);
	if( 0 && (bits>2) ){
		FILE *fp;
//		fp=fopen( "ADC_CH6_SamplingReads.txt", "w+" );
		fopen_s( &fp, "ADC_CH6_SamplingReads.txt", "w+" );
		for( int k=0; k<bits; k++ ){
			fprintf( fp, "%d	", k+1 );
			fprintf( fp, "%d\n", Rdata[SITE_1][k] );
		}
		fclose(fp);
	}
}

void MyGetResult_Test::qdl_reget(FOVI FO_Resource, double TGT, TRM_TB *trm_tb, int trmtb_len, int reg_adr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int *trmcd_in, double *result_in, int *trmcd_out, double *result_out, int scan_len){
	
	int i=0, m;
	int trmcd_stack[SITE_NUM][10], trmcd_index_in[SITE_NUM];
	double data_stack[SITE_NUM][10];
	double result_buf[SITE_NUM];
	double DeltaValue[10],v_min;

	SERIAL{
		trmcd_stack[SITE][0]=trmcd_in[SITE];
		data_stack[SITE][0]=result_in[SITE];
	}
	SERIAL{
		for(m=0; m<trmtb_len; m++)
			if(trm_tb[m].code == trmcd_in[SITE])	trmcd_index_in[SITE] = m;
	}

	while(i++ < scan_len){
		SERIAL{
			if(result_in[SITE] != TGT){
				if(result_in[SITE] > TGT)	trmcd_stack[SITE][i]=trm_tb[trmcd_index_in[SITE]-i].code;
				else trmcd_stack[SITE][i]=trm_tb[trmcd_index_in[SITE]+i].code;
			}
			else trmcd_stack[SITE][i]=trm_tb[trmcd_index_in[SITE]].code;
		}
		SERIAL trm_node.set_working(trmcd_stack[SITE][i], SITE);  // Set  trimming step
		OTP_Preview_Byte(I2C_DEVICE_ADDR,	reg_adr,	Treg_Assy_Name);  // Write  trim step to device register
		delay_ms(5);
		FO_Resource.MeasureVI(40, 10);
		SERIAL	result_buf[SITE] = FO_Resource.GetMeasResult(SITE, MIRET);
		SERIAL	data_stack[SITE][i]=result_buf[SITE];
	}
	SERIAL{
		for(i=0;i<(scan_len+1);i++)
			DeltaValue[i]=fabs(data_stack[SITE][i]-TGT);
		v_min=DeltaValue[0];
		trmcd_out[SITE]=trmcd_stack[SITE][0];
		result_out[SITE]=data_stack[SITE][0];
		for (i=0;i<(scan_len+1);i++){
			if(DeltaValue[i]<v_min){
				v_min=DeltaValue[i];
				result_out[SITE]=data_stack[SITE][i];
				trmcd_out[SITE]=trmcd_stack[SITE][i];
			}
		}
	}
	
}

void MyGetResult_Test::afa_out_reget(FOVI FO_Resource, double TGT, TRM_TB *trm_tb, int trmtb_len, int reg_adr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int *trmcd_in, double *result_in, int *trmcd_out, double *result_out, int scan_len){
	
	int i=0, m;
	int trmcd_stack[SITE_NUM][10], trmcd_index_in[SITE_NUM];
	double data_stack[SITE_NUM][10];
	double result_buf[SITE_NUM];
	double DeltaValue[10],v_min;

	SERIAL{
		trmcd_stack[SITE][0]=trmcd_in[SITE];
		data_stack[SITE][0]=result_in[SITE];
	}
	SERIAL{
		for(m=0; m<trmtb_len; m++)
			if(trm_tb[m].code == trmcd_in[SITE])	trmcd_index_in[SITE] = m;
	}

	while(i++ < scan_len){
		SERIAL{
			if(result_in[SITE] != TGT){
				if(result_in[SITE] > TGT)	trmcd_stack[SITE][i]=trm_tb[trmcd_index_in[SITE]-i].code;
				else trmcd_stack[SITE][i]=trm_tb[trmcd_index_in[SITE]+i].code;
			}
			else trmcd_stack[SITE][i]=trm_tb[trmcd_index_in[SITE]].code;
		}
		SERIAL trm_node.set_working(trmcd_stack[SITE][i], SITE);  // Set  trimming step
		OTP_Preview_Byte(I2C_DEVICE_ADDR,	reg_adr,	Treg_Assy_Name);  // Write  trim step to device register
		delay_ms(5);

		double results_vafa1[SITE_NUM],results_vafa2[SITE_NUM];

		dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x50);	delay_ms(1);
		FO_Resource.MeasureVI(40, 12);
		SERIAL 	results_vafa1[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);																	 
 		dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x58); 	delay_ms(1);
		FO_Resource.MeasureVI(40, 12);
		SERIAL 	results_vafa2[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);	

		SERIAL 	result_buf[SITE]=(results_vafa1[SITE]+results_vafa2[SITE])/2*1e3;
		SERIAL	data_stack[SITE][i]=result_buf[SITE];
	}
	SERIAL{
		for(i=0;i<(scan_len+1);i++)
			DeltaValue[i]=fabs(data_stack[SITE][i]-TGT);
		v_min=DeltaValue[0];
		trmcd_out[SITE]=trmcd_stack[SITE][0];
		result_out[SITE]=data_stack[SITE][0];
		for (i=0;i<(scan_len+1);i++){
			if(DeltaValue[i]<v_min){
				v_min=DeltaValue[i];
				result_out[SITE]=data_stack[SITE][i];
				trmcd_out[SITE]=trmcd_stack[SITE][i];
			}
		}
	}
	
}

void MyGetResult_Test::dql_BSearch(FOVI FO_Resource, double data_typical, int start_code, int end_code, int mid_code, TRM_TB *tab_name, int otpaddr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int index_num, int *trm_code){

	int i;
	double data_start[SITE_NUM], data_end[SITE_NUM], data_mid[SITE_NUM];
	double a[SITE_NUM], b[SITE_NUM];
	int code_start[SITE_NUM], code_end[SITE_NUM], code_mid[SITE_NUM];
	int index_start[SITE_NUM];
	int index_end[SITE_NUM];
	int index_mid[SITE_NUM];
	int SEARCH_DONE[SITE_NUM];
	for (SITE = 0; SITE<SITE_NUM; SITE++){
		index_start[SITE] = 0;
		index_end[SITE] = index_num - 1;
		index_mid[SITE] = index_num / 2;
		if (active_site(SITE))	SEARCH_DONE[SITE] = 0; else SEARCH_DONE[SITE] = 1;
	}
	SERIAL{
		code_start[SITE] = tab_name[index_start[SITE]].code;
		code_end[SITE] = tab_name[index_end[SITE]].code;
		code_mid[SITE] = tab_name[index_mid[SITE]].code;
	}

	//stt
	SERIAL trm_node.set_working(start_code, SITE);  // Set trimming step
	OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
	delay_ms(5);
	FO_Resource.MeasureVI(40, 10);
	SERIAL	data_start[SITE] = FO_Resource.GetMeasResult(SITE, MIRET);		//st
	SERIAL trm_node.set_working(end_code, SITE);  // Set trimming step
	OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
	delay_ms(5);
	FO_Resource.MeasureVI(40, 10);
	SERIAL	data_end[SITE] = FO_Resource.GetMeasResult(SITE, MIRET);		//end
	SERIAL trm_node.set_working(mid_code, SITE);  // Set trimming step
	OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
	delay_ms(5);
	FO_Resource.MeasureVI(40, 10);
	SERIAL	data_mid[SITE] = FO_Resource.GetMeasResult(SITE, MIRET);		//mid

	for (i = 0; i<10; i++){
		SERIAL{
			if (SEARCH_DONE[SITE] == 0){
				if (data_mid[SITE]>data_typical){
					code_end[SITE] = code_mid[SITE];
					data_end[SITE] = data_mid[SITE];
					index_end[SITE] = index_mid[SITE];
					if (index_end[SITE] - index_start[SITE] <= 1){
						a[SITE] = fabs(data_end[SITE] - data_typical);
						b[SITE] = fabs(data_start[SITE] - data_typical);
						if (a[SITE] <= b[SITE])	trm_code[SITE] = code_end[SITE];
						else if (a[SITE]>b[SITE])	trm_code[SITE] = code_start[SITE];
						SEARCH_DONE[SITE] = 1;
					}
					else if (index_end[SITE] - index_start[SITE]>1){
						index_mid[SITE] = (int)((index_end[SITE] + index_start[SITE]) / 2 + 0.5);
						code_mid[SITE] = tab_name[index_mid[SITE]].code;
					}
				}
				else if (data_mid[SITE]<data_typical){
					code_start[SITE] = code_mid[SITE];
					data_start[SITE] = data_mid[SITE];
					index_start[SITE] = index_mid[SITE];
					if (index_end[SITE] - index_start[SITE] <= 1){
						a[SITE] = fabs(data_end[SITE] - data_typical);
						b[SITE] = fabs(data_start[SITE] - data_typical);
						if (a[SITE] <= b[SITE])	trm_code[SITE] = code_end[SITE];
						else if (a[SITE]>b[SITE])	trm_code[SITE] = code_start[SITE];
						SEARCH_DONE[SITE] = 1;
					}
					else if (index_end[SITE] - index_start[SITE]>1){
						index_mid[SITE] = (int)((index_end[SITE] + index_start[SITE]) / 2 + 0.5);
						code_mid[SITE] = tab_name[index_mid[SITE]].code;
					}
				}
				else if (data_mid[SITE] == data_typical){
					trm_code[SITE] = code_mid[SITE];
					SEARCH_DONE[SITE] = 1;
				}
			}
		}
		if (SEARCH_DONE[SITE_1] == 1 && SEARCH_DONE[SITE_2] == 1)	break;
		SERIAL{
			if (SEARCH_DONE[SITE] == 0){
				trm_code[SITE] = code_mid[SITE];
			}
		}
		SERIAL trm_node.set_working(trm_code[SITE], SITE);  // Set trimming step
		OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
		delay_ms(5);
		FO_Resource.MeasureVI(40, 10);
		SERIAL	data_mid[SITE] = FO_Resource.GetMeasResult(SITE, MIRET);		//mid
	}
}

void MyGetResult_Test::afa_out_BSearch(FOVI FO_Resource, double data_typical, int start_code, int end_code, int mid_code, TRM_TB *tab_name, int otpaddr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int index_num, int *trm_code){

	int i;
	double data_start[SITE_NUM], data_end[SITE_NUM], data_mid[SITE_NUM];
	double a[SITE_NUM], b[SITE_NUM];
	int code_start[SITE_NUM], code_end[SITE_NUM], code_mid[SITE_NUM];
	int index_start[SITE_NUM];
	int index_end[SITE_NUM];
	int index_mid[SITE_NUM];
	int SEARCH_DONE[SITE_NUM];
	for (SITE = 0; SITE<SITE_NUM; SITE++){
		index_start[SITE] = 0;
		index_end[SITE] = index_num - 1;
		index_mid[SITE] = index_num / 2;
		if (active_site(SITE))	SEARCH_DONE[SITE] = 0; else SEARCH_DONE[SITE] = 1;
	}
	SERIAL{
		code_start[SITE] = tab_name[index_start[SITE]].code;
		code_end[SITE] = tab_name[index_end[SITE]].code;
		code_mid[SITE] = tab_name[index_mid[SITE]].code;
	}

	double results_vafa1[SITE_NUM],results_vafa2[SITE_NUM];
	//stt
	SERIAL trm_node.set_working(start_code, SITE);  // Set trimming step
	OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
	delay_ms(5);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x50);	delay_ms(1);
	FO_Resource.MeasureVI(40, 12);
	SERIAL 	results_vafa1[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);																	 
 	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x58); 	delay_ms(1);
	FO_Resource.MeasureVI(40, 12);
	SERIAL 	results_vafa2[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);	
	SERIAL 	data_start[SITE]=(results_vafa1[SITE]+results_vafa2[SITE])/2*1e3;		//st
		
	SERIAL trm_node.set_working(end_code, SITE);  // Set trimming step
	OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
	delay_ms(5);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x50);	delay_ms(1);
	FO_Resource.MeasureVI(40, 12);
	SERIAL 	results_vafa1[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);																	 
 	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x58); 	delay_ms(1);
	FO_Resource.MeasureVI(40, 12);
	SERIAL 	results_vafa2[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);	
	SERIAL 	data_end[SITE]=(results_vafa1[SITE]+results_vafa2[SITE])/2*1e3;		//end

	SERIAL trm_node.set_working(mid_code, SITE);  // Set trimming step
	OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
	delay_ms(5);
	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x50);	delay_ms(1);
	FO_Resource.MeasureVI(40, 12);
	SERIAL 	results_vafa1[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);																	 
 	dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x58); 	delay_ms(1);
	FO_Resource.MeasureVI(40, 12);
	SERIAL 	results_vafa2[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);
	SERIAL 	data_mid[SITE]=(results_vafa1[SITE]+results_vafa2[SITE])/2*1e3;		//mid

	for (i = 0; i<10; i++){
		SERIAL{
			if (SEARCH_DONE[SITE] == 0){
				if (data_mid[SITE]>data_typical){
					code_end[SITE] = code_mid[SITE];
					data_end[SITE] = data_mid[SITE];
					index_end[SITE] = index_mid[SITE];
					if (index_end[SITE] - index_start[SITE] <= 1){
						a[SITE] = fabs(data_end[SITE] - data_typical);
						b[SITE] = fabs(data_start[SITE] - data_typical);
						if (a[SITE] <= b[SITE])	trm_code[SITE] = code_end[SITE];
						else if (a[SITE]>b[SITE])	trm_code[SITE] = code_start[SITE];
						SEARCH_DONE[SITE] = 1;
					}
					else if (index_end[SITE] - index_start[SITE]>1){
						index_mid[SITE] = (int)((index_end[SITE] + index_start[SITE]) / 2 + 0.5);
						code_mid[SITE] = tab_name[index_mid[SITE]].code;
					}
				}
				else if (data_mid[SITE]<data_typical){
					code_start[SITE] = code_mid[SITE];
					data_start[SITE] = data_mid[SITE];
					index_start[SITE] = index_mid[SITE];
					if (index_end[SITE] - index_start[SITE] <= 1){
						a[SITE] = fabs(data_end[SITE] - data_typical);
						b[SITE] = fabs(data_start[SITE] - data_typical);
						if (a[SITE] <= b[SITE])	trm_code[SITE] = code_end[SITE];
						else if (a[SITE]>b[SITE])	trm_code[SITE] = code_start[SITE];
						SEARCH_DONE[SITE] = 1;
					}
					else if (index_end[SITE] - index_start[SITE]>1){
						index_mid[SITE] = (int)((index_end[SITE] + index_start[SITE]) / 2 + 0.5);
						code_mid[SITE] = tab_name[index_mid[SITE]].code;
					}
				}
				else if (data_mid[SITE] == data_typical){
					trm_code[SITE] = code_mid[SITE];
					SEARCH_DONE[SITE] = 1;
				}
			}
		}
		if (SEARCH_DONE[SITE_1] == 1 && SEARCH_DONE[SITE_2] == 1)	break;
		SERIAL{
			if (SEARCH_DONE[SITE] == 0){
				trm_code[SITE] = code_mid[SITE];
			}
		}
		SERIAL trm_node.set_working(trm_code[SITE], SITE);  // Set trimming step
		OTP_Preview_Byte(I2C_DEVICE_ADDR, otpaddr, Treg_Assy_Name);  // Write trim step to device register
		delay_ms(5);
		dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x50);	delay_ms(1);
		FO_Resource.MeasureVI(40, 12);
		SERIAL 	results_vafa1[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);																	 
 		dio.I2CWriteData(I2C_DEVICE_ADDR, 0xA3, 0x58); 	delay_ms(1);
		FO_Resource.MeasureVI(40, 12);
		SERIAL 	results_vafa2[SITE]=FO_Resource.GetMeasResult(SITE, MVRET);
		SERIAL 	data_mid[SITE]=(results_vafa1[SITE]+results_vafa2[SITE])/2*1e3;		//mid
	}
}

void dio_run_error_index(DIO &dio, char * beginLabel, char * endLabel, DWORD *errAddr, WORD *errData, int *errIndex, int failCnt)
{
    unsigned int depth = dio.GetBoardDepth();

    int beginIndex = -1;
    unsigned int beginAddr = -1;
    dio.GetLabelLineAddress(beginLabel, beginIndex, beginAddr);
    int endIndex = -1;
    unsigned int endAddr = -1;
    dio.GetLabelLineAddress(endLabel, endIndex, endAddr);

    int beingSection = beginIndex / depth;
    int endSection = endIndex / depth;
    if (beingSection == endSection)
    {
        for (int i = 0; i < failCnt; ++i)
        {
			errIndex[i] = beingSection * depth + errAddr[i] - beginIndex;// 计算 beginLabel的相对索引， 从0开始
        }
    }
    else
    {
        for (int i = 0; i < failCnt; ++i)
        {
            if (beginAddr <= errAddr[i] && errAddr[i] < depth)
            {
                errIndex[i] = beingSection * depth + errAddr[i] - beginIndex; // 计算 beginLabel的相对索引， 从0开始
            }
            else
            {
                errIndex[i] = endSection * depth + errAddr[i] - beginIndex;// 计算 beginLabel的相对索引， 从0开始
            }
        }
    }
}

